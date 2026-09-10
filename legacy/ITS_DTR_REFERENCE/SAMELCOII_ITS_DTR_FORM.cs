using MySql.Data.MySqlClient;
using SAMELCO_II.ITS_SYSTEM;
using System;
using System.Collections.Generic;
using System.Data;
using System.Drawing;
using System.Drawing.Printing;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Windows.Forms;
using Excel = Microsoft.Office.Interop.Excel;

namespace SAMELCO_II
{

    public partial class SAMELCOII_ITS_DTR_FORM : UserControl
    {
        private int currentBatchIndex = 0;     // which 3-employee batch we’re on
        private int totalEmployees = 0;     // listemployee.Items.Count
        private int startEmployeeIndex = 0;
        private int endEmployeeIndex = 0;
        private bool hasMoreData = false;
        private int printBatchIndex = 0;
        private MagnifierLens _lens;
        private System.Windows.Forms.Timer _lensWatch;
        private int employeeOffsetX = 0;  // a
        private readonly List<string> _printUserIds = new List<string>();
        private int _printCursor = 0;              // index of next employee to print
        private const int _perPage = 3;            // exactly 3 per page
        private int _printFromPage = 1;
        private int _printToPage = int.MaxValue;
        private int _printCurrentPage = 1;
        private readonly List<string> _monthPreviewUserIds = new List<string>();
        private int _monthPreviewCursor = 0;
        private float _printScale = 0.95f;                 // optional manual cap (0.10f..1.00f)
        private bool _fitToPage = true;                    // auto fit to page margins
        private SizeF _logicalContentSize = new SizeF(385f, 840f); // your logical content area (W,H)
        private TextBox _txtResearchDtr;
        private Control _resultContainerDtr;
        private Control _plClearDtr;
        private System.Windows.Forms.Timer _searchPickTimerDtr;
        private bool _manualSearchWired;
        private bool _listQuickRemoveWired;
        private ImageList _listEmployeeIcons;

        // Month header user id for monthly print
        private string _myUserIdForMonth = "";
        // signature anchors
        private static readonly Point SignaturePersonal = new Point(961, 756); // privileges 1–5
        private static readonly Point SignatureHead = new Point(10, 756); // privileges 7–10
        private Point _signatureAnchor = SignaturePersonal;                     // chosen on load
                                                                                // --- My Month preview/print state ---
        private PrintDocument _printDocMyMonth = new PrintDocument();
        private PrintPreviewControl _previewMonthCtl = null;

        private string _myUserId;
        private DateTime _monthStart, _monthEnd;
        // current user + privilege
        private string _currentUserId = string.Empty;
        private int _currentPrivilege = 0;
        public SAMELCOII_ITS_DTR_FORM()
        {
            InitializeComponent();
        }
        public string nameinfo;
        public string department;

        private static bool TryParsePunchTime(string value, out TimeSpan time)
        {
            time = default;
            if (string.IsNullOrWhiteSpace(value)) return false;

            var input = value.Trim();
            string[] formats =
            {
                "h:mm tt", "hh:mm tt", "h:mmtt", "hh:mmtt",
                "H:mm", "HH:mm", "H:mm:ss", "HH:mm:ss"
            };

            if (DateTime.TryParseExact(input, formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var exact))
            {
                time = exact.TimeOfDay;
                return true;
            }

            if (DateTime.TryParse(input, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
            {
                time = parsed.TimeOfDay;
                return true;
            }

            if (TimeSpan.TryParse(input, out var ts))
            {
                time = ts;
                return true;
            }

            return false;
        }

        private static string FormatPunchTime12(string value)
        {
            if (!TryParsePunchTime(value, out var ts)) return value;
            return DateTime.Today.Add(ts).ToString("h:mm", CultureInfo.InvariantCulture);
        }

        private static string NormalizeAreaKey(string area)
        {
            if (string.IsNullOrWhiteSpace(area)) return "";
            return string.Join(" ", area.Trim().ToUpperInvariant()
                .Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries));
        }

        private static Color? GetAreaMarkerColor(string area)
        {
            switch (NormalizeAreaKey(area))
            {
                case "MAIN":
                    return Color.DarkGreen;
                case "CATBALOGAN":
                    return Color.Red;
                case "CATBALOGAN SUB":
                    return Color.LightCoral;
                case "VILLAREAL":
                    return Color.Orange;
                case "VILLAREAL SUB":
                    return Color.DarkOrange;
                case "BASEY":
                    return Color.Blue;
                case "BAGOLIBAS SUB":
                    return Color.DarkViolet;
                default:
                    return null;
            }
        }

        private static string DetectAreaFromText(string text)
        {
            string up = NormalizeAreaKey(text ?? "");
            if (string.IsNullOrWhiteSpace(up)) return "";
            if (up.Contains("CATBALOGAN SUB")) return "CATBALOGAN SUB";
            if (up.Contains("CATBALOGAN")) return "CATBALOGAN";
            if (up.Contains("VILLAREAL SUB")) return "VILLAREAL SUB";
            if (up.Contains("VILLAREAL")) return "VILLAREAL";
            if (up.Contains("BAGOLIBAS SUB")) return "BAGOLIBAS SUB";
            if (up.Contains("BASEY")) return "BASEY";
            if (up.Contains("MAIN")) return "MAIN";
            return "";
        }

        private static string ToDisplayAreaName(string area)
        {
            string up = NormalizeAreaKey(area ?? "");
            if (string.IsNullOrWhiteSpace(up)) return "MAIN";
            if (up == "MAIN") return "PARANAS";
            return up;
        }

        // Noon boundary helper for special days (EPASS/LEAVE/TO):
        // hide any 12:xx OUT/IN display marks so special text can be shown cleanly.
        private static bool IsNoonBoundaryPunch(string value)
        {
            if (!TryParsePunchTime(value, out var ts)) return false;
            return ts.Hours == 12;
        }

        // Keep EPASS/LEAVE/TO marker short so it stays in the middle cell
        // and does not overlap PM OUT values.
        private static string CompactSpecialLabel(string value, int maxChars = 10)
        {
            if (string.IsNullOrWhiteSpace(value)) return "";
            string txt = value.Trim().ToUpperInvariant();
            if (txt.Length <= maxChars) return txt;
            if (maxChars <= 3) return txt.Substring(0, maxChars);
            return txt.Substring(0, maxChars - 3).TrimEnd() + "...";
        }

        private static bool IsThirdShiftWindow(string startRaw, string endRaw)
        {
            if (!TryParsePunchTime(startRaw, out var startTs) || !TryParsePunchTime(endRaw, out var endTs))
                return false;

            // Printed DTR values are usually "h:mm" with no AM/PM, so "8:00" can mean
            // either 8AM or 8PM. Only auto-move rendered text when meridiem is explicit.
            bool hasMeridiem =
                (startRaw ?? "").IndexOf("M", StringComparison.OrdinalIgnoreCase) >= 0 ||
                (endRaw ?? "").IndexOf("M", StringComparison.OrdinalIgnoreCase) >= 0;
            if (!hasMeridiem) return false;

            return startTs >= new TimeSpan(18, 0, 0) &&
                   startTs < new TimeSpan(22, 0, 0) &&
                   endTs <= new TimeSpan(5, 30, 0);
        }

        private static void MoveRenderedOvernightPairToShift3(
            ref string amIn, ref string amOut,
            ref string pmIn, ref string pmOut,
            ref string otIn, ref string otOut,
            ref string amInArea, ref string amOutArea,
            ref string pmInArea, ref string pmOutArea,
            ref string otInArea, ref string otOutArea,
            ref int utForDay)
        {
            if (IsThirdShiftWindow(amIn, amOut))
            {
                otIn = amIn;
                otOut = amOut;
                otInArea = amInArea;
                otOutArea = amOutArea;
                amIn = "";
                amOut = "";
                amInArea = "";
                amOutArea = "";
                utForDay = 0;
                return;
            }

            if (IsThirdShiftWindow(pmIn, pmOut))
            {
                otIn = pmIn;
                otOut = pmOut;
                otInArea = pmInArea;
                otOutArea = pmOutArea;
                pmIn = "";
                pmOut = "";
                pmInArea = "";
                pmOutArea = "";
                utForDay = 0;
            }
        }

        private static bool LooksLikeRenderedGuardShift3(string startRaw, string endRaw)
        {
            if (!TryParsePunchTime(startRaw, out var startTs) || !TryParsePunchTime(endRaw, out var endTs))
                return false;

            // Avoid guessing from "h:mm" text. With the new Security schedule, 11PM-7AM
            // is Shift 2 and must not be moved to Shift 3 by this print cleanup.
            bool hasMeridiem =
                (startRaw ?? "").IndexOf("M", StringComparison.OrdinalIgnoreCase) >= 0 ||
                (endRaw ?? "").IndexOf("M", StringComparison.OrdinalIgnoreCase) >= 0;
            if (!hasMeridiem) return false;

            bool startLooksLikeLateNightText =
                startTs >= new TimeSpan(18, 0, 0) &&
                startTs < new TimeSpan(22, 0, 0);
            bool endLooksLikeMorningText = endTs <= new TimeSpan(5, 30, 0);
            return startLooksLikeLateNightText && endLooksLikeMorningText;
        }

        private static void MoveRenderedGuardFallbackToShift3(
            ref string amIn, ref string amOut,
            ref string otIn, ref string otOut,
            ref string amInArea, ref string amOutArea,
            ref string otInArea, ref string otOutArea,
            ref int utForDay)
        {
            if (!string.IsNullOrWhiteSpace(otIn) || !string.IsNullOrWhiteSpace(otOut))
                return;

            if (!LooksLikeRenderedGuardShift3(amIn, amOut))
                return;

            otIn = amIn;
            otOut = amOut;
            otInArea = amInArea;
            otOutArea = amOutArea;
            amIn = "";
            amOut = "";
            amInArea = "";
            amOutArea = "";
            utForDay = 0;
        }

        private static void NormalizeGuardMonthRowsToShift3(DataTable dt)
        {
            if (dt == null) return;
            if (!dt.Columns.Contains("Morning_IN") || !dt.Columns.Contains("Morning_OUT") ||
                !dt.Columns.Contains("OT_IN") || !dt.Columns.Contains("OT_OUT"))
                return;

            foreach (DataRow row in dt.Rows)
            {
                string amIn = Convert.ToString(row["Morning_IN"]) ?? "";
                string amOut = Convert.ToString(row["Morning_OUT"]) ?? "";
                string otIn = Convert.ToString(row["OT_IN"]) ?? "";
                string otOut = Convert.ToString(row["OT_OUT"]) ?? "";

                if (!string.IsNullOrWhiteSpace(otIn) || !string.IsNullOrWhiteSpace(otOut))
                    continue;

                if (!LooksLikeRenderedGuardShift3(amIn, amOut))
                    continue;

                row["OT_IN"] = amIn;
                row["OT_OUT"] = amOut;
                row["Morning_IN"] = "";
                row["Morning_OUT"] = "";

                if (dt.Columns.Contains("OT_IN_Area") && dt.Columns.Contains("Morning_IN_Area"))
                    row["OT_IN_Area"] = row["Morning_IN_Area"];
                if (dt.Columns.Contains("OT_OUT_Area") && dt.Columns.Contains("Morning_OUT_Area"))
                    row["OT_OUT_Area"] = row["Morning_OUT_Area"];
                if (dt.Columns.Contains("Morning_IN_Area"))
                    row["Morning_IN_Area"] = "";
                if (dt.Columns.Contains("Morning_OUT_Area"))
                    row["Morning_OUT_Area"] = "";
                if (dt.Columns.Contains("Undertime_Min"))
                    row["Undertime_Min"] = 0;
                if (dt.Columns.Contains("LateCount"))
                    row["LateCount"] = 0;
            }
        }

        private static bool IsSecurityGuardPosition(string position)
        {
            if (string.IsNullOrWhiteSpace(position)) return false;
            var token = new string(position.ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());
            return token.Contains("SECURITYGUARD") || (token.Contains("SECURITY") && token.Contains("GUARD"));
        }

        private void DrawTimeWithAreaMarker(Graphics g, Font font, string rawTime, int x, int y, string employeeArea, string punchAreaHint = "")
        {
            if (string.IsNullOrWhiteSpace(rawTime))
            {
                g.DrawString("", font, Brushes.Black, new Point(x, y));
                return;
            }

            string text = FormatPunchTime12(rawTime);
            string emp = NormalizeAreaKey(employeeArea);
            string hint = NormalizeAreaKey(punchAreaHint);

            // Color only when employee punches in a DIFFERENT area.
            // If punch area is same as assigned area (or missing), do not draw color marker.
            string markerArea = "";
            if (!string.IsNullOrWhiteSpace(hint) &&
                !string.Equals(hint, emp, StringComparison.OrdinalIgnoreCase))
            {
                markerArea = hint;
            }

            var markerColor = GetAreaMarkerColor(markerArea);
            if (!markerColor.HasValue)
            {
                g.DrawString(text, font, Brushes.Black, new Point(x, y));
                return;
            }

            using (var markerBrush = new SolidBrush(markerColor.Value))
            {
                g.FillRectangle(markerBrush, x, y + 2, 3, Math.Max(10, font.Height - 3));
            }
            g.DrawString(text, font, Brushes.Black, new Point(x + 6, y));
        }

        private void DrawAreaLegend(Graphics g, Font font, int x, int y)
        {
            var legend = new[]
            {
                new { Label = "MAIN", Color = Color.DarkGreen },
                new { Label = "CATBALOGAN", Color = Color.Red },
                new { Label = "CATBALOGAN SUB", Color = Color.LightCoral },
                new { Label = "VILLAREAL", Color = Color.Orange },
                new { Label = "VILLAREAL SUB", Color = Color.DarkOrange },
                new { Label = "BASEY", Color = Color.Blue },
                new { Label = "BAGOLIBAS SUB", Color = Color.DarkViolet }
            };

            const int perRow = 4;
            const int colWidth = 80;
            const int rowHeight = 13;
            const int legendXOffset = 20; // requested: move legend by +20 on X
            using (var legendFont = new Font("Segoe UI", 6.5f, FontStyle.Regular))
            {
                for (int i = 0; i < legend.Length; i++)
                {
                    int row = i / perRow;
                    int col = i % perRow;
                    int itemX = x + legendXOffset + (col * colWidth);
                    int itemY = y + (row * rowHeight);

                    using (var b = new SolidBrush(legend[i].Color))
                        g.FillRectangle(b, itemX, itemY + 2, 9, 7);
                    g.DrawRectangle(Pens.Black, itemX, itemY + 2, 9, 7);
                    g.DrawString(legend[i].Label, legendFont, Brushes.Black, new Point(itemX + 12, itemY));
                }
            }
        }

        private string GetEmployeeAreaByAnyId(string anyId)
        {
            if (string.IsNullOrWhiteSpace(anyId)) return "";
            try
            {
                using (var con = new MySqlConnection(membershipCon.Constring2))
                using (var cmd = new MySqlCommand(@"
SELECT COALESCE(NULLIF(`area`,''), department, '') AS empArea
FROM usertb
WHERE bioUID=@id OR usercode=@id
LIMIT 1;", con))
                {
                    cmd.Parameters.AddWithValue("@id", anyId.Trim());
                    con.Open();
                    return Convert.ToString(cmd.ExecuteScalar()) ?? "";
                }
            }
            catch
            {
                try
                {
                    using (var con = new MySqlConnection(membershipCon.Constring2))
                    using (var cmd = new MySqlCommand(@"
SELECT COALESCE(department,'')
FROM usertb
WHERE bioUID=@id OR usercode=@id
LIMIT 1;", con))
                    {
                        cmd.Parameters.AddWithValue("@id", anyId.Trim());
                        con.Open();
                        return Convert.ToString(cmd.ExecuteScalar()) ?? "";
                    }
                }
                catch
                {
                    return "";
                }
            }
        }

        private static string ToAreaBucket(string area)
        {
            string up = NormalizeAreaKey(area ?? "");
            if (string.IsNullOrWhiteSpace(up)) return "MAIN";
            if (up.Contains("PARANAS") || up.Contains("MAIN")) return "MAIN";
            if (up.Contains("CATBALOGAN")) return "CATBALOGAN";
            if (up.Contains("VILLAREAL")) return "VILLAREAL";
            if (up.Contains("BASEY")) return "BASEY";
            return up;
        }

        private bool ShouldUseAreaCheckboxFilter()
        {
            string dep = Convert.ToString(cmddepartment?.SelectedItem ?? cmddepartment?.Text) ?? "";
            if (string.IsNullOrWhiteSpace(dep)) return false;

            string depNorm = NormalizeAreaKey(dep);
            return depNorm == "MR/COLLECTOR" ||
                   depNorm == "MR COLLECTOR" ||
                   depNorm == "DISCONNECTOR" ||
                   depNorm == "SECURITY GUARD";
        }

        private void UpdateAreaCheckboxMode()
        {
            bool useAreaFilter = ShouldUseAreaCheckboxFilter();

            CheckBox[] boxes = { ckparanas, ckcatbalogan, ckvillareal, ckbasey };
            foreach (var cb in boxes)
            {
                if (cb == null) continue;
                cb.Visible = useAreaFilter;
                cb.Enabled = useAreaFilter;
                if (!useAreaFilter) cb.Checked = false;
            }
        }

        private HashSet<string> GetSelectedAreaBuckets()
        {
            if (!ShouldUseAreaCheckboxFilter())
                return new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (ckparanas != null && ckparanas.Checked) set.Add("MAIN"); // PARANAS == MAIN
            if (ckcatbalogan != null && ckcatbalogan.Checked) set.Add("CATBALOGAN");
            if (ckvillareal != null && ckvillareal.Checked) set.Add("VILLAREAL");
            if (ckbasey != null && ckbasey.Checked) set.Add("BASEY");
            return set;
        }

        private bool IsAreaAllowedByCheckbox(string area)
        {
            var selected = GetSelectedAreaBuckets();
            if (selected.Count == 0) return true; // no area checkbox filter
            var bucket = ToAreaBucket(area);
            return selected.Contains(bucket);
        }

        private T FindControlByName<T>(string controlName) where T : Control
        {
            if (string.IsNullOrWhiteSpace(controlName)) return null;
            var found = this.Controls.Find(controlName, true);
            if (found == null || found.Length == 0) return null;
            return found.OfType<T>().FirstOrDefault();
        }

        private void TryWireManualSearchForDtr()
        {
            if (_manualSearchWired) return;

            _txtResearchDtr = FindControlByName<TextBox>("txtresearch");
            _resultContainerDtr = FindControlByName<Control>("resultContainer");
            _plClearDtr = FindControlByName<Control>("plclear");
            if (_txtResearchDtr == null || _resultContainerDtr == null) return;

            _txtResearchDtr.TextChanged -= TxtResearchDtr_TextChanged;
            _txtResearchDtr.TextChanged += TxtResearchDtr_TextChanged;
            if (_plClearDtr != null)
            {
                _plClearDtr.Click -= PlClearDtr_Click;
                _plClearDtr.Click += PlClearDtr_Click;
            }

            _searchPickTimerDtr = new System.Windows.Forms.Timer(components);
            _searchPickTimerDtr.Interval = 200;
            _searchPickTimerDtr.Tick -= SearchPickTimerDtr_Tick;
            _searchPickTimerDtr.Tick += SearchPickTimerDtr_Tick;
            _searchPickTimerDtr.Start();

            _manualSearchWired = true;
        }

        private void PlClearDtr_Click(object sender, EventArgs e)
        {
            if (_txtResearchDtr != null) _txtResearchDtr.Text = "";
            if (_resultContainerDtr != null)
            {
                _resultContainerDtr.Controls.Clear();
                _resultContainerDtr.Height = 0;
            }
            if (listemployee != null) listemployee.Items.Clear();
            if (dtrlist != null)
            {
                dtrlist.DataSource = null;
                SetupDTRGrid();
            }
        }

        private void TryWireListEmployeeQuickRemove()
        {
            if (_listQuickRemoveWired || listemployee == null) return;

            EnsureListEmployeeRemoveIcons();
            listemployee.FullRowSelect = true;
            listemployee.ShowItemToolTips = true;
            listemployee.KeyDown -= Listemployee_KeyDown_Remove;
            listemployee.KeyDown += Listemployee_KeyDown_Remove;
            listemployee.MouseDoubleClick -= Listemployee_MouseDoubleClick_Remove;
            listemployee.MouseDoubleClick += Listemployee_MouseDoubleClick_Remove;
            _listQuickRemoveWired = true;
        }

        private void Listemployee_KeyDown_Remove(object sender, KeyEventArgs e)
        {
            if (e.KeyCode != Keys.Delete) return;
            RemoveSelectedListEmployees();
            e.Handled = true;
        }

        private void Listemployee_MouseDoubleClick_Remove(object sender, MouseEventArgs e)
        {
            var hit = listemployee.HitTest(e.Location);
            if (hit?.Item == null) return;
            listemployee.Items.Remove(hit.Item);
            RefreshDtrFromEmployeeList();
        }

        private void RemoveSelectedListEmployees()
        {
            if (listemployee.SelectedItems.Count == 0) return;
            foreach (ListViewItem it in listemployee.SelectedItems.Cast<ListViewItem>().ToList())
                listemployee.Items.Remove(it);
            RefreshDtrFromEmployeeList();
        }

        private void EnsureListEmployeeRemoveIcons()
        {
            if (_listEmployeeIcons != null) return;
            _listEmployeeIcons = new ImageList
            {
                ColorDepth = ColorDepth.Depth32Bit,
                ImageSize = new Size(14, 14),
                TransparentColor = Color.Transparent
            };

            using (var bmp = new Bitmap(14, 14))
            using (var g = Graphics.FromImage(bmp))
            using (var pen = new Pen(Color.Firebrick, 2f))
            {
                g.Clear(Color.Transparent);
                g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                g.DrawEllipse(pen, 1, 1, 11, 11);
                g.DrawLine(pen, 4, 4, 9, 9);
                g.DrawLine(pen, 9, 4, 4, 9);
                _listEmployeeIcons.Images.Add("remove", (Image)bmp.Clone());
            }

            listemployee.SmallImageList = _listEmployeeIcons;
        }

        private DataTable BuildDTRFromListEmployeeItems(DateTime startDate, DateTime endDate)
        {
            var master = new DataTable();
            master.Columns.Add("userID", typeof(string));
            master.Columns.Add("WorkDate", typeof(DateTime));
            master.Columns.Add("Morning_IN", typeof(string));
            master.Columns.Add("Morning_OUT", typeof(string));
            master.Columns.Add("Afternoon_IN", typeof(string));
            master.Columns.Add("Afternoon_OUT", typeof(string));
            master.Columns.Add("OT_IN", typeof(string));
            master.Columns.Add("OT_OUT", typeof(string));
            master.Columns.Add("Morning_IN_Area", typeof(string));
            master.Columns.Add("Morning_OUT_Area", typeof(string));
            master.Columns.Add("Afternoon_IN_Area", typeof(string));
            master.Columns.Add("Afternoon_OUT_Area", typeof(string));
            master.Columns.Add("OT_IN_Area", typeof(string));
            master.Columns.Add("OT_OUT_Area", typeof(string));
            master.Columns.Add("WorkedMinutes", typeof(int));
            master.Columns.Add("Undertime_Min", typeof(int));
            master.Columns.Add("Late_Min", typeof(int));
            master.Columns.Add("LateCount", typeof(int));
            master.Columns.Add("DailyPay", typeof(decimal));
            master.Columns.Add("PerHour", typeof(decimal));
            master.Columns.Add("PerMinute", typeof(decimal));
            master.Columns.Add("OT_Minutes", typeof(int));

            var ids = listemployee.Items.Cast<ListViewItem>()
                .Select(it => ((it.SubItems.Count > 2) ? it.SubItems[2].Text : Convert.ToString(it.Tag))?.Trim())
                .Where(uid => !string.IsNullOrWhiteSpace(uid))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            foreach (string uid in ids)
            {
                string position = GetEmployeePositionByUserId(uid) ?? "";
                DataTable dtr = MembershipDataHelper.GetDTRData(uid, position, startDate, endDate, uid);
                foreach (DataRow r in dtr.Rows)
                {
                    var nr = master.NewRow();
                    nr["userID"] = r["userID"];
                    nr["WorkDate"] = r["WorkDate"];
                    nr["Morning_IN"] = r["Morning_IN"];
                    nr["Morning_OUT"] = r["Morning_OUT"];
                    nr["Afternoon_IN"] = r["Afternoon_IN"];
                    nr["Afternoon_OUT"] = r["Afternoon_OUT"];
                    nr["OT_IN"] = r["OT_IN"];
                    nr["OT_OUT"] = r["OT_OUT"];
                    nr["Morning_IN_Area"] = r["Morning_IN_Area"];
                    nr["Morning_OUT_Area"] = r["Morning_OUT_Area"];
                    nr["Afternoon_IN_Area"] = r["Afternoon_IN_Area"];
                    nr["Afternoon_OUT_Area"] = r["Afternoon_OUT_Area"];
                    nr["OT_IN_Area"] = r["OT_IN_Area"];
                    nr["OT_OUT_Area"] = r["OT_OUT_Area"];
                    nr["WorkedMinutes"] = r["WorkedMinutes"];
                    nr["Undertime_Min"] = r["Undertime_Min"];
                    nr["Late_Min"] = r["Late_Min"];
                    nr["LateCount"] = r["LateCount"];
                    nr["DailyPay"] = r["DailyPay"];
                    nr["PerHour"] = r["PerHour"];
                    nr["PerMinute"] = r["PerMinute"];
                    nr["OT_Minutes"] = r["OT_Minutes"];
                    master.Rows.Add(nr);
                }
            }

            master.DefaultView.Sort = "userID ASC, WorkDate ASC";
            return master.DefaultView.ToTable();
        }

        private void RefreshDtrFromEmployeeList()
        {
            if (dtrlist == null) return;
            DateTime startDate = datefrom.Value.Date;
            DateTime endDate = datetonow.Value.Date;
            dtrlist.DataSource = null;
            SetupDTRGrid();
            dtrlist.DataSource = BuildDTRFromListEmployeeItems(startDate, endDate);
        }

        private void TxtResearchDtr_TextChanged(object sender, EventArgs e)
        {
            if (_txtResearchDtr == null || _resultContainerDtr == null) return;

            string key = (_txtResearchDtr.Text ?? "").Trim();
            if (key.Length < 1)
            {
                _resultContainerDtr.Controls.Clear();
                _resultContainerDtr.Height = 0;
                return;
            }

            var get = new SAMELCO_II.ITS_SYSTEM.Data();
            get.Search(key);

            _resultContainerDtr.Controls.Clear();
            foreach (var data in SAMELCO_II.ITS_SYSTEM.Data.list)
            {
                var res = new SAMELCO_II.ITS_SYSTEM.searchResultControl();
                res.details(data);
                WireSearchResultPick(res, data.id);
                _resultContainerDtr.Controls.Add(res);
            }
            _resultContainerDtr.Height = _resultContainerDtr.Controls.Count * 61;
        }

        private void WireSearchResultPick(Control root, string usercode)
        {
            if (root == null || string.IsNullOrWhiteSpace(usercode)) return;

            void hook(Control c)
            {
                c.Cursor = Cursors.Hand;
                c.Click -= SearchResultPicked_Click;
                c.Click += SearchResultPicked_Click;
                c.Tag = usercode;
                foreach (Control child in c.Controls) hook(child);
            }

            hook(root);
        }

        private void SearchResultPicked_Click(object sender, EventArgs e)
        {
            var c = sender as Control;
            string selectedUsercode = Convert.ToString(c?.Tag)?.Trim() ?? "";
            if (string.IsNullOrWhiteSpace(selectedUsercode)) return;
            AddManualEmployeeToList(selectedUsercode);

            if (_resultContainerDtr != null)
            {
                _resultContainerDtr.Controls.Clear();
                _resultContainerDtr.Height = 0;
            }
            if (_txtResearchDtr != null) _txtResearchDtr.SelectAll();
        }

        private void SearchPickTimerDtr_Tick(object sender, EventArgs e)
        {
            if (!SAMELCO_II.ITS_SYSTEM.searchResultControl.Clicked) return;

            string selectedUsercode = (SAMELCO_II.ITS_SYSTEM.searchResultControl.id2 ?? "").Trim();
            SAMELCO_II.ITS_SYSTEM.searchResultControl.Clicked = false;
            if (string.IsNullOrWhiteSpace(selectedUsercode)) return;

            AddManualEmployeeToList(selectedUsercode);

            if (_resultContainerDtr != null)
            {
                _resultContainerDtr.Controls.Clear();
                _resultContainerDtr.Height = 0;
            }
        }

        private void AddManualEmployeeToList(string anyId)
        {
            if (string.IsNullOrWhiteSpace(anyId)) return;

            string bioUid = "";
            string empName = "";
            string empDept = "";

            using (var con = new MySqlConnection(membershipCon.Constring2))
            using (var cmd = new MySqlCommand(@"
SELECT bioUID, name, department
FROM usertb
WHERE usercode=@id OR bioUID=@id
LIMIT 1;", con))
            {
                cmd.Parameters.AddWithValue("@id", anyId.Trim());
                con.Open();
                using (var rd = cmd.ExecuteReader())
                {
                    if (!rd.Read()) return;
                    bioUid = Convert.ToString(rd["bioUID"]) ?? "";
                    empName = Convert.ToString(rd["name"]) ?? "";
                    empDept = Convert.ToString(rd["department"]) ?? "";
                }
            }

            string key = string.IsNullOrWhiteSpace(bioUid) ? anyId.Trim() : bioUid.Trim();
            bool exists = listemployee.Items.Cast<ListViewItem>().Any(it =>
            {
                string itemBio = (it.SubItems.Count > 2 ? it.SubItems[2].Text : "")?.Trim() ?? "";
                string itemTag = Convert.ToString(it.Tag)?.Trim() ?? "";
                return string.Equals(itemBio, key, StringComparison.OrdinalIgnoreCase) ||
                       string.Equals(itemTag, key, StringComparison.OrdinalIgnoreCase);
            });
            if (exists) return;

            var item = new ListViewItem(empName) { Tag = key };
            item.SubItems.Add(empDept);
            item.SubItems.Add(key);
            item.Checked = true;
            item.ImageKey = "remove";
            item.ToolTipText = "Double-click or press Delete to remove from print list";
            listemployee.Items.Add(item);
            RefreshDtrFromEmployeeList();
        }

        private void AutoCheckAreaByAreaText(string area, bool clearOthers = true)
        {
            var bucket = ToAreaBucket(area);
            if (clearOthers)
            {
                ckparanas.Checked = false;
                ckcatbalogan.Checked = false;
                ckvillareal.Checked = false;
                ckbasey.Checked = false;
            }

            switch (bucket)
            {
                case "CATBALOGAN":
                    ckcatbalogan.Checked = true;
                    break;
                case "VILLAREAL":
                    ckvillareal.Checked = true;
                    break;
                case "BASEY":
                    ckbasey.Checked = true;
                    break;
                default:
                    ckparanas.Checked = true; // MAIN/PARANAS default
                    break;
            }
        }

        private void AutoCheckAreaByDepartmentSelection()
        {
            string dep = Convert.ToString(cmddepartment?.SelectedItem ?? cmddepartment?.Text) ?? "";
            if (string.IsNullOrWhiteSpace(dep)) return;

            if (!ShouldUseAreaCheckboxFilter())
                return;

            string depNorm = NormalizeAreaKey(dep);
            if (depNorm.Contains("CATBALOGAN"))
                AutoCheckAreaByAreaText("CATBALOGAN");
            else if (depNorm.Contains("VILLAREAL"))
                AutoCheckAreaByAreaText("VILLAREAL");
            else if (depNorm.Contains("BASEY"))
                AutoCheckAreaByAreaText("BASEY");
            else if (depNorm.Contains("PARANAS") || depNorm.Contains("MAIN"))
                AutoCheckAreaByAreaText("MAIN");
        }

        public static (string name, string department, string usercode) GetEmployeeInfo(string anyId)
        {
            string name = "";
            string department = "";
            string code = "";

            const string query = @"
        SELECT name, department, usercode
        FROM usertb
        WHERE bioUID = @id OR usercode = @id
        LIMIT 1;";

            using (var mycon = new MySqlConnection(membershipCon.Constring2))
            {
                try
                {
                    mycon.Open();
                    using (var cmd = new MySqlCommand(query, mycon))
                    {
                        cmd.Parameters.AddWithValue("@id", anyId ?? "");
                        using (var reader = cmd.ExecuteReader())
                        {
                            if (reader.Read())
                            {
                                name = reader["name"]?.ToString() ?? "";
                                department = reader["department"]?.ToString() ?? "";
                                code = reader["usercode"]?.ToString() ?? "";
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Database Error (GetEmployeeInfo): {ex.Message}");
                }
            }

            return (name, department, code);
        }




        private void BuildPrintUserListFromListView()
        {
            _printUserIds.Clear();
            var selectedAreas = GetSelectedAreaBuckets();
            var addedUserIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            IEnumerable<ListViewItem> sourceItems = listemployee.Items.Cast<ListViewItem>();
            var checkedItems = listemployee.CheckedItems.Cast<ListViewItem>().ToList();
            if (checkedItems.Count > 0)
                sourceItems = checkedItems;

            // Your ListView stores bioUID either in SubItems[2] or Tag (keep both just in case)
            foreach (ListViewItem it in sourceItems)
            {
                string uid = ((it.SubItems.Count > 2) ? it.SubItems[2].Text : Convert.ToString(it.Tag))?.Trim();
                if (string.IsNullOrWhiteSpace(uid)) continue;
                var ids = ResolveIds(uid);
                string printUid = string.IsNullOrWhiteSpace(ids.bioUID) ? uid : ids.bioUID.Trim();
                if (!addedUserIds.Add(printUid))
                    continue;

                if (selectedAreas.Count > 0)
                {
                    string empArea = GetEmployeeAreaByAnyId(printUid);
                    if (!IsAreaAllowedByCheckbox(empArea))
                        continue;
                }

                if (UserHasAnyPunchInGrid(printUid))
                    _printUserIds.Add(printUid);
            }
        }

        private bool UserHasAnyPunchInGrid(string anyId)
        {
            if (string.IsNullOrWhiteSpace(anyId) || dtrlist == null) return false;

            var ids = ResolveIds(anyId.Trim());
            string targetBio = (ids.bioUID ?? anyId).Trim();

            foreach (DataGridViewRow row in dtrlist.Rows)
            {
                if (row == null || row.IsNewRow) continue;

                string uid = (Convert.ToString(row.Cells["userID"]?.Value) ?? "").Trim();
                if (!string.Equals(uid, targetBio, StringComparison.OrdinalIgnoreCase)) continue;

                string amIn = Convert.ToString(row.Cells["Morning_IN"]?.Value) ?? "";
                string amOut = Convert.ToString(row.Cells["Morning_OUT"]?.Value) ?? "";
                string pmIn = Convert.ToString(row.Cells["Afternoon_IN"]?.Value) ?? "";
                string pmOut = Convert.ToString(row.Cells["Afternoon_OUT"]?.Value) ?? "";
                string otIn = dtrlist.Columns.Contains("OT_IN") ? (Convert.ToString(row.Cells["OT_IN"]?.Value) ?? "") : "";
                string otOut = dtrlist.Columns.Contains("OT_OUT") ? (Convert.ToString(row.Cells["OT_OUT"]?.Value) ?? "") : "";

                if (new[] { amIn, amOut, pmIn, pmOut, otIn, otOut }.Any(s => TryParsePunchTime(s, out _)))
                    return true;
            }
            return false;
        }
        private void ApplyLegalLandscapeTo(PrintDocument doc)
        {
            // Landscape
            doc.DefaultPageSettings.Landscape = true;

            // Try to find a real Legal size on this printer
            var legal = doc.PrinterSettings.PaperSizes
                            .Cast<PaperSize>()
                            .FirstOrDefault(ps => ps.Kind == PaperKind.Legal);

            if (legal != null)
            {
                doc.DefaultPageSettings.PaperSize = legal;
            }
            else
            {
                // Fallback: request a custom "Legal" size (some printers may ignore this)
                // 8.5in x 14in → hundredths of an inch
                doc.DefaultPageSettings.PaperSize = new PaperSize("Legal", 850, 1400);
            }
        }

        private int GetUserPrivilege(string userId)
        {
            try
            {
                using (var con = new MySqlConnection(membershipCon.Constring2))
                using (var cmd = new MySqlCommand(
                    "SELECT privilage FROM usertb WHERE bioUID=@id OR usercode=@id LIMIT 1;", con))
                {
                    cmd.Parameters.AddWithValue("@id", userId);
                    con.Open();
                    var v = cmd.ExecuteScalar();
                    return (v == null) ? 0 : Convert.ToInt32(v);
                }
            }
            catch
            {
                return 0;
            }
        }



        // Helper class for database operations
        public static class MembershipDataHelper
        {
            private static readonly object _deptCacheLock = new object();
            private static DataTable _departmentsCache;
            private static DateTime _departmentsCacheAt = DateTime.MinValue;
            private static readonly TimeSpan _departmentsCacheTtl = TimeSpan.FromMinutes(3);

            // Get all departments
            public static DataTable GetDepartments()
            {
                lock (_deptCacheLock)
                {
                    if (_departmentsCache != null &&
                        (DateTime.Now - _departmentsCacheAt) <= _departmentsCacheTtl)
                    {
                        return _departmentsCache.Copy();
                    }
                }

                DataTable dt = new DataTable();
                string query = "SELECT DISTINCT department FROM usertb";

                using (MySqlConnection mycon = new MySqlConnection(membershipCon.Constring2))
                {
                    try
                    {
                        mycon.Open();
                        using (var cmd = new MySqlCommand(query, mycon))
                        using (var adapter = new MySqlDataAdapter(cmd))
                        {
                            adapter.Fill(dt);
                        }

                        lock (_deptCacheLock)
                        {
                            _departmentsCache = dt.Copy();
                            _departmentsCacheAt = DateTime.Now;
                        }
                    }
                    catch (Exception ex)
                    {
                        if (ex.Message.IndexOf("Too many connections", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            try { MySqlConnection.ClearAllPools(); } catch { }
                            lock (_deptCacheLock)
                            {
                                if (_departmentsCache != null) return _departmentsCache.Copy();
                            }
                        }

                        MessageBox.Show($"Database Error (departments): {ex.Message}");
                    }
                }

                return dt;
            }
            public static DataTable GetDepartments2()
            {
                DataTable dt = new DataTable();
                string query = "SELECT NAME FROM departmenttb"; // 'NAME' is the department name

                using (MySqlConnection mycon = new MySqlConnection(membershipCon.Constring2))
                {
                    try
                    {
                        mycon.Open();
                        using (var cmd = new MySqlCommand(query, mycon))
                        using (var adapter = new MySqlDataAdapter(cmd))
                        {
                            adapter.Fill(dt);
                        }
                    }
                    catch (Exception ex)
                    {
                        if (ex.Message.IndexOf("Too many connections", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            try { MySqlConnection.ClearAllPools(); } catch { }
                        }
                        MessageBox.Show($"Database Error (departments): {ex.Message}");
                    }
                }

                return dt;
            }



















            // Get employees by department
            // ✅ Get Employees by Department (already fine)
            public static DataTable GetEmployeesByDepartment(string department)
            {
                DataTable dt = new DataTable();
                string dep = (department ?? "").Trim();
                bool isAll = string.IsNullOrWhiteSpace(dep) || dep.Equals("ALL", StringComparison.OrdinalIgnoreCase);
                bool isSecurityGuard = dep.Equals("Security Guard", StringComparison.OrdinalIgnoreCase);
                bool isSubstationTender = dep.Equals("Substation Tender", StringComparison.OrdinalIgnoreCase);
                bool isMrCollector = dep.Equals("MR/Collector", StringComparison.OrdinalIgnoreCase) || dep.Equals("MR Collector", StringComparison.OrdinalIgnoreCase);
                bool isDisconnector = dep.Equals("Disconnector", StringComparison.OrdinalIgnoreCase);
                bool isAreaTsdFilter = dep.EndsWith(" TSD", StringComparison.OrdinalIgnoreCase);
                bool isAreaFilter =
                    dep.Equals("Basey", StringComparison.OrdinalIgnoreCase) ||
                    dep.Equals("Villareal", StringComparison.OrdinalIgnoreCase) ||
                    dep.Equals("Catbalogan", StringComparison.OrdinalIgnoreCase);

                string query;
                if (isAll)
                {
                    query = "SELECT bioUID, name, department, position FROM usertb WHERE bioUID != 0 ORDER BY name ASC";
                }
                else if (isSecurityGuard)
                {
                    query = "SELECT bioUID, name, department, position FROM usertb WHERE bioUID != 0 AND position = @position ORDER BY name ASC";
                }
                else if (isSubstationTender)
                {
                    query = "SELECT bioUID, name, department, position FROM usertb WHERE bioUID != 0 AND position = @position ORDER BY name ASC";
                }
                else if (isMrCollector)
                {
                    query = @"
SELECT bioUID, name, department, position
FROM usertb
WHERE bioUID != 0
  AND REPLACE(UPPER(COALESCE(position,'')), ' ', '') IN ('MR/COLLECTOR', 'MRCOLLECTOR')
ORDER BY name ASC";
                }
                else if (isDisconnector)
                {
                    query = @"
SELECT bioUID, name, department, position
FROM usertb
WHERE bioUID != 0
  AND UPPER(COALESCE(position,'')) = 'DISCONNECTOR'
ORDER BY name ASC";
                }
                else if (isAreaTsdFilter)
                {
                    query = @"
SELECT bioUID, name, department, position
FROM usertb
WHERE bioUID != 0
  AND UPPER(TRIM(COALESCE(NULLIF(area,''), ''))) = UPPER(@area)
  AND (
        UPPER(COALESCE(department,'')) = 'TSD'
        OR UPPER(COALESCE(department,'')) LIKE '%TECHNICAL SERVICES DEPARTMENT%'
      )
ORDER BY name ASC";
                }
                else if (isAreaFilter)
                {
                    query = @"
SELECT bioUID, name, department, position
FROM usertb
WHERE bioUID != 0
  AND UPPER(TRIM(COALESCE(NULLIF(area,''), ''))) = UPPER(@area)
  AND UPPER(COALESCE(department,'')) <> 'TSD'
  AND UPPER(COALESCE(department,'')) NOT LIKE '%TECHNICAL SERVICES DEPARTMENT%'
  AND position <> 'Security Guard'
  AND position <> 'Substation Tender'
  AND REPLACE(UPPER(COALESCE(position,'')), ' ', '') NOT IN ('MR/COLLECTOR', 'MRCOLLECTOR')
  AND UPPER(COALESCE(position,'')) <> 'DISCONNECTOR'
ORDER BY name ASC";
                }
                else
                {
                    // Department print excludes special position groups to avoid duplicate printing.
                    query = @"
SELECT bioUID, name, department, position
FROM usertb
WHERE department = @department
  AND bioUID != 0
  AND UPPER(TRIM(COALESCE(NULLIF(area,''), 'MAIN'))) = 'MAIN'
  AND position <> 'Security Guard'
  AND position <> 'Substation Tender'
  AND REPLACE(UPPER(COALESCE(position,'')), ' ', '') NOT IN ('MR/COLLECTOR', 'MRCOLLECTOR')
  AND UPPER(COALESCE(position,'')) <> 'DISCONNECTOR'
ORDER BY name ASC";
                }

                using (MySqlConnection mycon = new MySqlConnection(membershipCon.Constring2))
                {
                    try
                    {
                        mycon.Open();
                        using (var cmd = new MySqlCommand(query, mycon))
                        {
                            if (isSecurityGuard)
                                cmd.Parameters.AddWithValue("@position", "Security Guard");
                            else if (isSubstationTender)
                                cmd.Parameters.AddWithValue("@position", "Substation Tender");
                            else if (isAreaTsdFilter)
                                cmd.Parameters.AddWithValue("@area", dep.Substring(0, dep.Length - 4).Trim());
                            else if (isAreaFilter)
                                cmd.Parameters.AddWithValue("@area", dep);
                            else if (!isAll)
                                cmd.Parameters.AddWithValue("@department", dep);

                            using (var adapter = new MySqlDataAdapter(cmd))
                            {
                                adapter.Fill(dt);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        if (ex.Message.IndexOf("Too many connections", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            try { MySqlConnection.ClearAllPools(); } catch { }
                        }
                        MessageBox.Show($"Database Error (employees): {ex.Message}");
                    }
                }

                return dt;
            }


            private static int? GetBioUidIntFromUsercode(MySqlConnection con, string anyId)
            {
                if (string.IsNullOrWhiteSpace(anyId)) return null;

                using (var cmd = new MySqlCommand(@"
        SELECT bioUID
        FROM usertb
        WHERE usercode=@id OR bioUID=@id
        LIMIT 1;", con))
                {
                    cmd.Parameters.AddWithValue("@id", anyId.Trim());
                    var o = cmd.ExecuteScalar();
                    if (o == null || o == DBNull.Value) return null;

                    if (int.TryParse(Convert.ToString(o), out int bio)) return bio;
                    return null;
                }
            }



            public class Punch
            {
                public string UserID { get; set; }
                public DateTime Dt { get; set; }
                public string Type { get; set; }
                public string Area { get; set; }
            }
            public static DataTable GetDTRData(
       string userId,
       string position,
       DateTime startDate,
       DateTime endDate,
       string userIDFilter)
            {
                var dt = new DataTable();

                // Schema expected by your grid/printing (keep userID as string for UI compatibility)
                dt.Columns.Add("userID", typeof(string));
                dt.Columns.Add("WorkDate", typeof(DateTime));
                dt.Columns.Add("Morning_IN", typeof(string));
                dt.Columns.Add("Morning_OUT", typeof(string));
                dt.Columns.Add("Afternoon_IN", typeof(string));
                dt.Columns.Add("Afternoon_OUT", typeof(string));
                dt.Columns.Add("OT_IN", typeof(string));
                dt.Columns.Add("OT_OUT", typeof(string));
                dt.Columns.Add("Morning_IN_Area", typeof(string));
                dt.Columns.Add("Morning_OUT_Area", typeof(string));
                dt.Columns.Add("Afternoon_IN_Area", typeof(string));
                dt.Columns.Add("Afternoon_OUT_Area", typeof(string));
                dt.Columns.Add("OT_IN_Area", typeof(string));
                dt.Columns.Add("OT_OUT_Area", typeof(string));
                dt.Columns.Add("WorkedMinutes", typeof(int));
                dt.Columns.Add("Undertime_Min", typeof(int));
                dt.Columns.Add("Late_Min", typeof(int));
                dt.Columns.Add("LateCount", typeof(int));
                dt.Columns.Add("DailyPay", typeof(decimal));
                dt.Columns.Add("PerHour", typeof(decimal));
                dt.Columns.Add("PerMinute", typeof(decimal));
                dt.Columns.Add("OT_Minutes", typeof(int));

                // ✅ LOCAL HELPERS (fixes: "does not exist in current context" + avoids duplicates in other classes)
                int? ResolveBioUidInt(MySqlConnection con, string anyId)
                {
                    if (string.IsNullOrWhiteSpace(anyId)) return null;

                    using (var cmd = new MySqlCommand(@"
SELECT bioUID
FROM usertb
WHERE bioUID = @id OR usercode = @id
LIMIT 1;", con))
                    {
                        cmd.Parameters.AddWithValue("@id", anyId.Trim());
                        var o = cmd.ExecuteScalar();
                        if (o == null || o == DBNull.Value) return null;

                        if (int.TryParse(Convert.ToString(o), out int v)) return v;
                        return null;
                    }
                }

                DateTime TrimToMinute(DateTime t)
                    => new DateTime(t.Year, t.Month, t.Day, t.Hour, t.Minute, 0);

                DateTime? PickNearestTo(DateTime target, IEnumerable<DateTime> candidates)
                {
                    DateTime? best = null;
                    double bestDiff = double.MaxValue;
                    foreach (var c in candidates)
                    {
                        double d = Math.Abs((c - target).TotalMinutes);
                        if (d < bestDiff)
                        {
                            bestDiff = d;
                            best = c;
                        }
                    }
                    return best;
                }

                DateTime? PickOutByPattern(DateTime? inTime, IEnumerable<DateTime> candidates, DateTime fallbackTarget)
                {
                    var list = candidates?.OrderBy(x => x).ToList() ?? new List<DateTime>();
                    if (list.Count == 0) return null;

                    // Prefer OUT that gives an ~8-hour duty span from IN (mixed schedules support).
                    if (inTime.HasValue)
                    {
                        DateTime? best = null;
                        double bestScore = double.MaxValue;
                        foreach (var c in list)
                        {
                            if (c <= inTime.Value) continue;
                            double h = (c - inTime.Value).TotalHours;
                            if (h < 4.0 || h > 12.0) continue; // ignore unrealistic pairings
                            double score = Math.Abs(h - 8.0);
                            if (score < bestScore)
                            {
                                bestScore = score;
                                best = c;
                            }
                        }
                        if (best.HasValue) return best;
                    }

                    // Fallback: nearest to schedule target.
                    return PickNearestTo(fallbackTarget, list);
                }

                string PosToken(string pos)
                {
                    if (string.IsNullOrWhiteSpace(pos)) return "";
                    var chars = pos.ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray();
                    return new string(chars);
                }

                string NormalizePunchType(object inoutSmallObj, object checkTypeObj, object inoutModeObj)
                {
                    string raw = (Convert.ToString(inoutSmallObj) ?? "").Trim();
                    string s = raw.ToUpperInvariant();
                    string checkType = (Convert.ToString(checkTypeObj) ?? "").Trim().ToUpperInvariant();
                    string mode = (Convert.ToString(inoutModeObj) ?? "").Trim();

                    // Source of truth: inout_small (supports I/O and i/o).
                    if (raw == "I" || raw == "O" || raw == "i" || raw == "o") return raw;

                    // Numeric fallback used by some devices: 0=I, 1=O
                    if (int.TryParse(s, out int ns))
                    {
                        if (ns == 0) return "I";
                        if (ns == 1) return "O";
                    }

                    // UNK fallback:
                    // CHECKTYPE='UNK' + inout_small='U' with inout_mode 4/5
                    // 4 => IN, 5 => OUT
                    if (checkType == "UNK" && s == "U")
                    {
                        if (mode == "4") return "I";
                        if (mode == "5") return "O";
                    }

                    return ""; // unknown / ignore
                }

                using (var mycon = new MySqlConnection(membershipCon.Constring2))
                {
                    mycon.Open();

                    // Robust shift worker detection (handles spacing/case/variants in DB values)
                    string posToken = PosToken(position ?? "");
                    bool isSecurityGuardWorker =
                        posToken.Contains("SECURITYGUARD") ||
                        (posToken.Contains("SECURITY") && posToken.Contains("GUARD"));
                    bool isSubstationTenderWorker =
                        posToken.Contains("SUBSTATIONTENDER") ||
                        (posToken.Contains("SUBSTATION") && posToken.Contains("TENDER")) ||
                        posToken.Contains("SSTENDER");
                    bool isMaintenanceWorker =
                        posToken == "MAINTENANCE" ||
                        posToken.Contains("MAINTENANCE");
                    bool useLegacyMaintenanceSchedule = true; // Maintenance uses its own 3-shift schedule with early login windows.
                    bool isTellerWorker =
                        posToken == "TELLER" ||
                        posToken.Contains("TELLER");
                    bool isShiftWorker = isSecurityGuardWorker || isSubstationTenderWorker || isMaintenanceWorker;

                    // --- salary (for pay columns) ---
                    decimal basicMonthly = 0m;
                    using (var salCmd = new MySqlCommand(
                        "SELECT basic FROM usertb WHERE bioUID = @id OR usercode = @id LIMIT 1;", mycon))
                    {
                        salCmd.Parameters.AddWithValue("@id", userId ?? "");
                        var sal = salCmd.ExecuteScalar();
                        if (sal != null) decimal.TryParse(Convert.ToString(sal), out basicMonthly);
                    }

                    decimal perDay = Math.Round((basicMonthly * 12m) / 365m, 2);
                    decimal perHour = Math.Round(perDay / 8m, 2);
                    decimal perMinute = Math.Round(perHour / 60m, 2);

                    // Resolve the actual checkinout.USERID (INT)
                    int? uidInt = ResolveBioUidInt(mycon, string.IsNullOrWhiteSpace(userIDFilter) ? userId : userIDFilter);
                    if (uidInt == null) return dt;

                    // ✅ index-friendly range (NO DATE(CHECKTIME))
                    // For shift workers, include previous day too so first-day overnight OUT
                    // (e.g., Mar 1 07:xx with Feb 28 22:xx IN) can be paired correctly.
                    DateTime start = isShiftWorker ? startDate.Date.AddDays(-1) : startDate.Date;
                    // For shift workers, include next day to catch overnight OUT punches (e.g., 23:00-07:00).
                    DateTime endExclusive = endDate.Date.AddDays(isShiftWorker ? 2 : 1);

                    const string sql = @"
SELECT USERID, CHECKTIME, CHECKTYPE, inout_mode, inout_small, COALESCE(area,'') AS area
FROM checkinout
WHERE USERID = @uid
  AND CHECKTIME >= @start
  AND CHECKTIME <  @endExclusive
ORDER BY CHECKTIME ASC;";

                    var raw = new DataTable();
                    using (var cmd = new MySqlCommand(sql, mycon))
                    {
                        cmd.Parameters.Add("@uid", MySqlDbType.Int32).Value = uidInt.Value;
                        cmd.Parameters.Add("@start", MySqlDbType.DateTime).Value = start;
                        cmd.Parameters.Add("@endExclusive", MySqlDbType.DateTime).Value = endExclusive;
                        new MySqlDataAdapter(cmd).Fill(raw);
                    }

                    var punches = raw.AsEnumerable()
                        .Select(r => new Punch
                        {
                            UserID = Convert.ToString(r["USERID"]) ?? "",
                            Dt = TrimToMinute(Convert.ToDateTime(r["CHECKTIME"])),
                            Type = NormalizePunchType(r["inout_small"], r["CHECKTYPE"], r["inout_mode"]),
                            Area = Convert.ToString(r["area"]) ?? ""
                        })
                        .Where(p => !string.IsNullOrWhiteSpace(p.Type))
                        .OrderBy(p => p.Dt)
                        .ToList();

                    var byDay = punches
                        .GroupBy(p => p.Dt.Date)
                        .ToDictionary(g => g.Key, g => g.ToList());

                    int OverlapMinutes(DateTime s1, DateTime e1, DateTime s2, DateTime e2)
                    {
                        var s = (s1 > s2) ? s1 : s2;
                        var e = (e1 < e2) ? e1 : e2;
                        return e > s ? (int)(e - s).TotalMinutes : 0;
                    }

                    string fmt(DateTime? t) => t.HasValue ? t.Value.ToString("h:mm", CultureInfo.InvariantCulture) : "";
                    string areaOf(List<Punch> src, DateTime? t, string typ)
                    {
                        if (!t.HasValue || src == null) return "";
                        var p = src.FirstOrDefault(x =>
                            string.Equals(x.Type, typ, StringComparison.OrdinalIgnoreCase) &&
                            x.Dt == t.Value);
                        return p?.Area ?? "";
                    }

                    string areaOfAnyType(List<Punch> src, DateTime? t)
                    {
                        if (!t.HasValue || src == null) return "";
                        var p = src.FirstOrDefault(x => x.Dt == t.Value);
                        return p?.Area ?? "";
                    }

                    int capHalf = 240;
                    int lateAllowanceRemaining = 60;

                    for (DateTime day = startDate.Date; day <= endDate.Date; day = day.AddDays(1))
                    {
                        if (!byDay.TryGetValue(day.AddDays(-1), out var prevDay)) prevDay = new List<Punch>();
                        if (!byDay.TryGetValue(day, out var todays)) todays = new List<Punch>();
                        if (!byDay.TryGetValue(day.AddDays(1), out var nextDay)) nextDay = new List<Punch>();

                        DateTime AM_START = day.AddHours(8);
                        DateTime AM_END = day.AddHours(12);
                        DateTime PM_START = day.AddHours(13);
                        DateTime PM_END = day.AddHours(17);

                        DateTime? amIn = null, amOut = null, pmIn = null, pmOut = null;
                        DateTime? otIn = null, otOut = null;
                        int otMinutes = 0;
                        string amInAreaType = "I";
                        string pmInAreaType = "I";

                        if (!isShiftWorker)
                        {
                            // AM IN: keep only true morning arrivals. Noon/after-noon IN punches
                            // such as 12:40 PM belong to PM IN, not AM IN.
                            amIn = todays.Where(x => x.Type == "I" && x.Dt.TimeOfDay >= new TimeSpan(4, 0, 0) && x.Dt.TimeOfDay < new TimeSpan(12, 0, 0))
                                         .Select(x => (DateTime?)x.Dt).FirstOrDefault();

                            var amInRecoveredFromOut = todays
                                .Where(x => x.Type == "O" && x.Dt.TimeOfDay >= new TimeSpan(4, 0, 0) && x.Dt.TimeOfDay <= new TimeSpan(10, 59, 59))
                                .Select(x => (DateTime?)x.Dt)
                                .FirstOrDefault();

                            // Human-error recovery:
                            // 1) No AM IN at all -> use earliest morning OUT.
                            // 2) AM IN exists but is too late (near lunch), while there is an early morning OUT:
                            //    treat early OUT as AM IN (device mode mistake).
                            bool amInLooksTooLate = amIn.HasValue && amIn.Value.TimeOfDay >= new TimeSpan(11, 30, 0);
                            if ((!amIn.HasValue || amInLooksTooLate) && amInRecoveredFromOut.HasValue)
                            {
                                amIn = amInRecoveredFromOut;
                                amInAreaType = "O";
                            }

                            // Include lunch-out punches from late morning through early afternoon.
                            // Floor at 10:00 (not 10:30) so early lunch exits like 10:07 still map to
                            // AM OUT; otherwise UT treats AM as missing and charges a full half-day.
                            // Some real logs land around 1:45-1:55 PM, and those should still
                            // appear as the midday OUT instead of looking missing on the form.
                            amOut = todays.Where(x => x.Type == "O" && x.Dt.TimeOfDay >= new TimeSpan(10, 0, 0) && x.Dt.TimeOfDay <= new TimeSpan(14, 0, 0))
                                          .Select(x => (DateTime?)x.Dt).LastOrDefault();
                            if (amInAreaType == "O" && amIn.HasValue && amOut.HasValue && amOut.Value == amIn.Value)
                                amOut = null;

                            // Keep PM-IN capture inclusive from an early lunch-return window.
                            // Some devices/users log back a little before 11:30 (for example 11:22),
                            // and those should still land in PM IN when they happen after AM OUT.
                            // Also avoid reusing the same late AM-IN punch as PM IN when there is no lunch break yet.
                            pmIn = todays.Where(x => x.Type == "I"
                                                  && x.Dt.TimeOfDay >= new TimeSpan(12, 0, 0)
                                                  && x.Dt.TimeOfDay <= new TimeSpan(16, 0, 0)
                                                  && (!amIn.HasValue || x.Dt > amIn.Value)
                                                  && (!amOut.HasValue || x.Dt >= amOut.Value))
                                         .Select(x => (DateTime?)x.Dt).FirstOrDefault();

                            // Human-error recovery:
                            // If PM IN is missing and first afternoon punch is mistakenly marked OUT,
                            // treat that first early-afternoon OUT as PM IN.
                            if (!pmIn.HasValue)
                            {
                                pmIn = todays.Where(x => x.Type == "O" && x.Dt.TimeOfDay >= new TimeSpan(12, 0, 0) && x.Dt.TimeOfDay <= new TimeSpan(14, 30, 0))
                                             .Where(x => !amOut.HasValue || x.Dt > amOut.Value)
                                             .Select(x => (DateTime?)x.Dt).FirstOrDefault();
                                if (pmIn.HasValue) pmInAreaType = "O";
                            }

                            var otInExplicit = todays.Where(x => x.Type == "i")
                                                     .Select(x => (DateTime?)x.Dt)
                                                     .FirstOrDefault();
                            var otOutExplicit = todays.Where(x => x.Type == "o")
                                                      .Select(x => (DateTime?)x.Dt)
                                                      .LastOrDefault();
                            var otInExplicitLast = todays.Where(x => x.Type == "i")
                                                         .Select(x => (DateTime?)x.Dt)
                                                         .LastOrDefault();
                            var lateRegularInFallback = todays.Where(x => x.Type == "I"
                                                                      && x.Dt.TimeOfDay >= new TimeSpan(15, 0, 0)
                                                                      && x.Dt.TimeOfDay <= new TimeSpan(21, 30, 0))
                                                             .Select(x => (DateTime?)x.Dt)
                                                             .LastOrDefault();

                            TimeSpan otFallbackStart = new TimeSpan(17, 0, 0);
                            var otInFallback = todays.Where(x => x.Type == "I" && x.Dt.TimeOfDay >= otFallbackStart)
                                                     .Select(x => (DateTime?)x.Dt)
                                                     .FirstOrDefault();
                            var fallbackOuts = todays.Where(x => x.Type == "O" && x.Dt.TimeOfDay >= otFallbackStart)
                                                     .Select(x => x.Dt)
                                                     .OrderBy(x => x)
                                                     .ToList();
                            var otOutFallback = fallbackOuts.Select(x => (DateTime?)x).LastOrDefault();
                            bool hasFallbackOtPair = otInFallback.HasValue && otOutFallback.HasValue && otOutFallback > otInFallback;
                            bool hasExplicitOtPair = otInExplicit.HasValue && otOutExplicit.HasValue && otOutExplicit > otInExplicit;
                            bool hasExplicitOtOutOnly = otOutExplicit.HasValue && !hasExplicitOtPair;
                            DateTime? regularOutAfterFallbackIn = null;
                            if (otInFallback.HasValue)
                            {
                                regularOutAfterFallbackIn = fallbackOuts
                                    .Where(x => x > otInFallback.Value && x.TimeOfDay <= new TimeSpan(18, 30, 0))
                                    .Select(x => (DateTime?)x)
                                    .FirstOrDefault();
                            }

                            // PM OUT: when no explicit overtime flags are used, capture the last out
                            // from 5:00 PM up to 11:59 PM so late regular duty is not dropped.
                            // If explicit OT flags exist, keep PM OUT in regular-office range.
                            bool hasExplicitOt = hasExplicitOtPair;
                            if (hasExplicitOt)
                            {
                                pmOut = todays.Where(x => x.Type == "O" && x.Dt.TimeOfDay >= new TimeSpan(15, 0, 0) && x.Dt.TimeOfDay <= new TimeSpan(18, 30, 0))
                                              .Select(x => (DateTime?)x.Dt).LastOrDefault();
                            }
                            else
                            {
                                if (hasFallbackOtPair)
                                {
                                    // Keep the regular PM OUT separate from OT OUT.
                                    // Example: 5:00 PM regular out, 5:30 PM OT in, 9:30 PM OT out.
                                    pmOut = todays.Where(x => x.Type == "O"
                                                           && x.Dt.TimeOfDay >= new TimeSpan(15, 0, 0)
                                                           && x.Dt < otInFallback.Value)
                                                  .Select(x => (DateTime?)x.Dt)
                                                  .LastOrDefault();

                                    // Device fallback case:
                                    // 5:00 PM may be logged as UNK/mode-4 (mapped to IN),
                                    // then the true regular OUT comes a few minutes later.
                                    // Keep that early-evening OUT in PM OUT and reserve the later
                                    // night OUT for OT OUT.
                                    if (!pmOut.HasValue && regularOutAfterFallbackIn.HasValue)
                                    {
                                        pmOut = regularOutAfterFallbackIn;
                                    }
                                }
                                else
                                {
                                    pmOut = todays.Where(x => x.Type == "O" && x.Dt.TimeOfDay >= new TimeSpan(17, 0, 0) && x.Dt.TimeOfDay <= new TimeSpan(23, 59, 59))
                                                  .Select(x => (DateTime?)x.Dt).LastOrDefault();
                                }

                                // fallback if employee logs earlier than 5PM
                                if (!pmOut.HasValue)
                                {
                                    pmOut = todays.Where(x => x.Type == "O" && x.Dt.TimeOfDay >= new TimeSpan(15, 0, 0) && x.Dt.TimeOfDay <= new TimeSpan(23, 59, 59))
                                                  .Select(x => (DateTime?)x.Dt).LastOrDefault();
                                }

                                // A lone explicit OT OUT without a matching OT IN is usually a regular
                                // late home-out punch. Keep it in PM OUT instead of OT OUT.
                                if (!pmOut.HasValue && hasExplicitOtOutOnly && otOutExplicit.Value.TimeOfDay >= new TimeSpan(15, 0, 0))
                                {
                                    pmOut = otOutExplicit;
                                }

                                // A lone explicit OT IN without a matching OT OUT can be a mistaken
                                // end-of-day OUT punch. Keep it visible in PM OUT instead of dropping it.
                                if (!pmOut.HasValue && !hasExplicitOtPair && otInExplicitLast.HasValue && otInExplicitLast.Value.TimeOfDay >= new TimeSpan(15, 0, 0))
                                {
                                    pmOut = otInExplicitLast;
                                }

                                // A lone late regular IN without a matching PM OUT can also be a mistaken
                                // end-of-day OUT (common on UNK/mode-4 device punches around 5PM).
                                if (!pmOut.HasValue && !hasFallbackOtPair && !hasExplicitOtPair && lateRegularInFallback.HasValue)
                                {
                                    pmOut = lateRegularInFallback;
                                }
                            }

                            if (hasExplicitOtPair)
                            {
                                // Prefer explicit OT flags from biometrics when present.
                                otIn = otInExplicit;
                                otOut = otOutExplicit;
                            }
                            else
                            {
                                // Fallback for UNK/U mapped by inout_mode 4/5:
                                // treat after-office regular I/O punches as overtime
                                // ONLY when there is a valid IN+OUT OT pair.
                                if (hasFallbackOtPair)
                                {
                                    otIn = otInFallback;
                                    if (pmOut.HasValue)
                                    {
                                        var lateOtOutAfterPmOut = fallbackOuts
                                            .Where(x => x > pmOut.Value.AddMinutes(1))
                                            .Select(x => (DateTime?)x)
                                            .LastOrDefault();

                                        // Only keep OT when there is a distinct later OUT after
                                        // the regular PM OUT.
                                        if (lateOtOutAfterPmOut.HasValue)
                                        {
                                            otOut = lateOtOutAfterPmOut;
                                        }
                                        else
                                        {
                                            otIn = null;
                                            otOut = null;
                                        }
                                    }
                                    else
                                    {
                                        otOut = otOutFallback;
                                    }
                                }
                                else
                                {
                                    otIn = null;
                                    otOut = null;
                                }
                            }

                            // Preserve the regular home-out before overtime starts.
                            // Example: 5:02 PM OUT, 5:23 PM OT IN, 9:30 PM OT OUT.
                            // The 5:02 PM must remain visible in PM OUT on the print.
                            DateTime? regularOutBeforeOt = null;
                            DateTime? overtimeStart = otIn ?? otInFallback;
                            if (overtimeStart.HasValue)
                            {
                                regularOutBeforeOt = todays
                                    .Where(x => x.Type == "O"
                                             && x.Dt.TimeOfDay >= new TimeSpan(15, 0, 0)
                                             && x.Dt < overtimeStart.Value)
                                    .Select(x => (DateTime?)x.Dt)
                                    .LastOrDefault();
                            }

                            if (regularOutBeforeOt.HasValue &&
                                (!pmOut.HasValue || pmOut.Value >= overtimeStart.GetValueOrDefault()))
                            {
                                pmOut = regularOutBeforeOt;
                            }

                            // Display fallback:
                            // If there is a very late PM OUT but no OT pair/in, show it in OT OUT as well
                            // so printouts don't look like missing night OUT punches.
                            if (!otOut.HasValue && pmOut.HasValue && pmOut.Value.TimeOfDay >= new TimeSpan(19, 0, 0))
                            {
                                otOut = pmOut;
                            }

                            if (otIn.HasValue && otOut.HasValue && otOut > otIn)
                            {
                                var effectiveIn = otIn.Value;
                                var floor08 = otIn.Value.Date.AddHours(8);
                                if (effectiveIn < floor08) effectiveIn = floor08;

                                if (otOut > effectiveIn)
                                    otMinutes = (int)(otOut.Value - effectiveIn).TotalMinutes;
                            }

                            // Final safety net for regular employees:
                            // keep valid raw morning IN / regular OUT punches even when the rest
                            // of the day is incomplete or device tags are inconsistent.
                            var firstMorningInRaw = todays
                                .Where(x => x.Type == "I"
                                         && x.Dt.TimeOfDay >= new TimeSpan(4, 0, 0)
                                         && x.Dt.TimeOfDay < new TimeSpan(12, 0, 0))
                                .Select(x => (DateTime?)x.Dt)
                                .FirstOrDefault();
                            if (!amIn.HasValue && firstMorningInRaw.HasValue)
                            {
                                amIn = firstMorningInRaw;
                                amInAreaType = "I";
                            }

                            var lastRegularOutRaw = todays
                                .Where(x => x.Type == "O"
                                         && x.Dt.TimeOfDay >= new TimeSpan(15, 0, 0)
                                         && x.Dt.TimeOfDay <= new TimeSpan(18, 30, 0))
                                .Select(x => (DateTime?)x.Dt)
                                .LastOrDefault();
                            if (!pmOut.HasValue && lastRegularOutRaw.HasValue)
                            {
                                pmOut = lastRegularOutRaw;
                            }
                        }
                        else
                        {
                            bool IsInType(Punch p) => p.Type == "I" || p.Type == "i";
                            bool IsOutType(Punch p) => p.Type == "O" || p.Type == "o";
                            bool IsShiftEndOutType(Punch p) =>
                                IsOutType(p) ||
                                ((p.Type == "I" || p.Type == "i") &&
                                 p.Dt.TimeOfDay >= new TimeSpan(15, 0, 0) &&
                                 p.Dt.TimeOfDay <= new TimeSpan(21, 30, 0));

                            if (isMaintenanceWorker && useLegacyMaintenanceSchedule)
                            {
                                var all = prevDay.Concat(todays).Concat(nextDay).OrderBy(x => x.Dt).ToList();

                                DateTime maintenanceS1Start = day;
                                DateTime maintenanceS1End = day.AddHours(8);
                                DateTime maintenanceS2Start = day.AddHours(8);
                                DateTime maintenanceS2End = day.AddHours(16);
                                DateTime maintenanceS3Start = day.AddHours(16);
                                DateTime maintenanceS3End = day.AddDays(1);

                                // Maintenance Shift 1 is 12AM-8AM, but operations can log in early.
                                // Accept 9PM-12:59AM so punches like 9:38PM still pair to next-day 8AM OUT.
                                var maintenanceS1In = all.Where(x => IsInType(x)
                                                       && x.Dt >= maintenanceS1Start.AddHours(-3)
                                                       && x.Dt <= maintenanceS1Start.AddMinutes(59))
                                              .Select(x => (DateTime?)x.Dt)
                                              .FirstOrDefault();

                                var maintenanceS1OutCandidates = all
                                    .Where(x => IsShiftEndOutType(x)
                                             && x.Dt >= maintenanceS1End.AddHours(-2)
                                             && x.Dt <= maintenanceS1End.AddHours(4))
                                    .Select(x => x.Dt)
                                    .ToList();
                                var maintenanceS1Out = PickOutByPattern(maintenanceS1In, maintenanceS1OutCandidates, maintenanceS1End);

                                var maintenanceS2In = all.Where(x => IsInType(x)
                                                       && x.Dt >= maintenanceS2Start.AddHours(-1)
                                                       && x.Dt <= maintenanceS2Start.AddMinutes(59))
                                              .Select(x => (DateTime?)x.Dt)
                                              .FirstOrDefault();

                                var maintenanceS2OutCandidates = all
                                    .Where(x => IsShiftEndOutType(x)
                                             && x.Dt >= maintenanceS2End.AddHours(-2)
                                             && x.Dt <= maintenanceS2End.AddHours(4))
                                    .Select(x => x.Dt)
                                    .ToList();
                                var maintenanceS2Out = PickOutByPattern(maintenanceS2In, maintenanceS2OutCandidates, maintenanceS2End);

                                var maintenanceS3In = all.Where(x => IsInType(x)
                                                       && x.Dt >= maintenanceS3Start.AddHours(-1)
                                                       && x.Dt <= maintenanceS3Start.AddMinutes(59))
                                              .Select(x => (DateTime?)x.Dt)
                                              .FirstOrDefault();

                                var maintenanceS3OutCandidates = all
                                    .Where(x => IsOutType(x)
                                             && x.Dt >= maintenanceS3End.AddHours(-2)
                                             && x.Dt <= maintenanceS3End.AddHours(4))
                                    .Select(x => x.Dt)
                                    .ToList();
                                var maintenanceS3Out = PickOutByPattern(maintenanceS3In, maintenanceS3OutCandidates, maintenanceS3End);

                                amIn = maintenanceS1In; amOut = maintenanceS1Out;
                                pmIn = maintenanceS2In; pmOut = maintenanceS2Out;
                                otIn = maintenanceS3In; otOut = maintenanceS3Out;

                                int FlexibleMaintenanceMinutes(DateTime? inTime, DateTime? outTime)
                                {
                                    if (!inTime.HasValue || !outTime.HasValue || outTime.Value <= inTime.Value)
                                        return 0;

                                    return Math.Min(480, (int)(outTime.Value - inTime.Value).TotalMinutes);
                                }

                                int maintenanceWorkS1 = FlexibleMaintenanceMinutes(maintenanceS1In, maintenanceS1Out);
                                int maintenanceWorkS2 = FlexibleMaintenanceMinutes(maintenanceS2In, maintenanceS2Out);
                                int maintenanceWorkS3 = FlexibleMaintenanceMinutes(maintenanceS3In, maintenanceS3Out);

                                otMinutes = maintenanceWorkS3;
                                AM_START = maintenanceS1Start; AM_END = maintenanceS1End;
                                PM_START = maintenanceS2Start; PM_END = maintenanceS2End;

                                int workedBestShiftMaintenance = Math.Max(maintenanceWorkS1, Math.Max(maintenanceWorkS2, maintenanceWorkS3));
                                bool hasAnyPunchMaintenance = maintenanceS1In.HasValue || maintenanceS1Out.HasValue || maintenanceS2In.HasValue || maintenanceS2Out.HasValue || maintenanceS3In.HasValue || maintenanceS3Out.HasValue;
                                bool isWeekendDayMaintenance = (day.DayOfWeek == DayOfWeek.Saturday || day.DayOfWeek == DayOfWeek.Sunday);
                                bool isFutureDayMaintenance = day.Date > DateTime.Today;

                                int shiftUTMaintenance = hasAnyPunchMaintenance ? Math.Max(0, 480 - workedBestShiftMaintenance) : 480;
                                if (isWeekendDayMaintenance && !hasAnyPunchMaintenance) shiftUTMaintenance = 0;
                                if (isFutureDayMaintenance && !hasAnyPunchMaintenance) shiftUTMaintenance = 0;

                                lateAllowanceRemaining = 60;

                                var rowMaintenance = dt.NewRow();
                                rowMaintenance["userID"] = uidInt.Value.ToString();
                                rowMaintenance["WorkDate"] = day;
                                rowMaintenance["Morning_IN"] = fmt(amIn);
                                rowMaintenance["Morning_OUT"] = fmt(amOut);
                                rowMaintenance["Afternoon_IN"] = fmt(pmIn);
                                rowMaintenance["Afternoon_OUT"] = fmt(pmOut);
                                rowMaintenance["OT_IN"] = fmt(otIn);
                                rowMaintenance["OT_OUT"] = fmt(otOut);
                                rowMaintenance["Morning_IN_Area"] = areaOf(prevDay.Concat(todays).ToList(), amIn, "I");
                                rowMaintenance["Morning_OUT_Area"] = areaOfAnyType(todays.Concat(nextDay).ToList(), amOut);
                                rowMaintenance["Afternoon_IN_Area"] = areaOf(todays, pmIn, "I");
                                rowMaintenance["Afternoon_OUT_Area"] = areaOfAnyType(todays.Concat(nextDay).ToList(), pmOut);
                                rowMaintenance["OT_IN_Area"] = areaOf(todays, otIn, "i");
                                rowMaintenance["OT_OUT_Area"] = areaOfAnyType(nextDay.Concat(todays).ToList(), otOut);
                                rowMaintenance["WorkedMinutes"] = Math.Min(480, workedBestShiftMaintenance);
                                rowMaintenance["Undertime_Min"] = shiftUTMaintenance;
                                rowMaintenance["Late_Min"] = 0;
                                rowMaintenance["LateCount"] = shiftUTMaintenance;
                                rowMaintenance["DailyPay"] = Math.Round(Math.Max(0m, perDay - Math.Round(shiftUTMaintenance * perMinute, 2)), 2);
                                rowMaintenance["PerHour"] = perHour;
                                rowMaintenance["PerMinute"] = perMinute;
                                rowMaintenance["OT_Minutes"] = otMinutes;
                                dt.Rows.Add(rowMaintenance);
                                continue;
                            }

                            if (isSecurityGuardWorker)
                            {
                                // Security schedules from operations:
                                // Shift 1: 7AM-3PM, 7AM-4PM, 8AM-5PM, 3PM-11PM
                                // Shift 2: 11PM-7AM
                                // Shift 3: 8PM-4AM
                                var all = todays.Concat(nextDay).OrderBy(x => x.Dt).ToList();
                                var amShifts = new[]
                                {
                                    (Start: day.AddHours(7), End: day.AddHours(16)),
                                    (Start: day.AddHours(8), End: day.AddHours(17)),
                                    (Start: day.AddHours(7), End: day.AddHours(15)),
                                    (Start: day.AddHours(15), End: day.AddHours(23))
                                };
                                var pmShift = (Start: day.AddHours(23), End: day.AddDays(1).AddHours(7));
                                var otShifts = new[]
                                {
                                    (Start: day.AddHours(20), End: day.AddDays(1).AddHours(4))
                                };

                                (DateTime? In, DateTime? Out, int Work) PickBest((DateTime Start, DateTime End)[] defs, double earlyInHours = 2.0)
                                {
                                    DateTime? bestIn = null, bestOut = null;
                                    int bestWork = 0;
                                    foreach (var sh in defs)
                                    {
                                        var inCand = all.Where(x => IsInType(x)
                                                                 && x.Dt >= sh.Start.AddHours(-earlyInHours)
                                                                 && x.Dt <= sh.Start.AddHours(4))
                                                        .Select(x => (DateTime?)x.Dt)
                                                        .FirstOrDefault();

                                        var outCand = all.Where(x => IsShiftEndOutType(x)
                                                                   && x.Dt >= sh.End.AddHours(-4)
                                                                   && x.Dt <= sh.End.AddHours(4))
                                                         .Select(x => (DateTime?)x.Dt)
                                                         .LastOrDefault();

                                        int work = (inCand.HasValue && outCand.HasValue && outCand > inCand)
                                            ? OverlapMinutes(inCand.Value, outCand.Value, sh.Start, sh.End)
                                            : 0;

                                        if (work > bestWork)
                                        {
                                            bestWork = work;
                                            bestIn = inCand;
                                            bestOut = outCand;
                                        }
                                    }
                                    return (bestIn, bestOut, bestWork);
                                }

                                // Do not let previous-night continuation punches like 5:16 AM become
                                // the same day's Shift 1 IN. Those can close Shift 3 instead.
                                var amBest = PickBest(amShifts, earlyInHours: 1.5);
                                var pmBest = PickBest(new[] { pmShift });
                                var otBest = PickBest(otShifts);

                                bool SameShiftPair((DateTime? In, DateTime? Out, int Work) a, (DateTime? In, DateTime? Out, int Work) b)
                                    => a.In.HasValue && a.Out.HasValue && b.In.HasValue && b.Out.HasValue &&
                                       a.In.Value == b.In.Value && a.Out.Value == b.Out.Value;

                                bool StartsAsSecurityShift2(DateTime? inTime)
                                    => inTime.HasValue &&
                                       (inTime.Value.TimeOfDay >= new TimeSpan(22, 0, 0) ||
                                        inTime.Value.TimeOfDay <= new TimeSpan(1, 30, 0));

                                if (SameShiftPair(pmBest, otBest))
                                {
                                    // 11PM-7AM belongs to Shift 2, while around 8PM-4AM belongs to Shift 3.
                                    if (StartsAsSecurityShift2(pmBest.In))
                                        otBest = (null, null, 0);
                                    else
                                        pmBest = (null, null, 0);
                                }

                                // Security Guard only:
                                // If an 8PM-area punch on this day is followed by the first early-morning
                                // punch next day, treat it as Shift 3 continuation even when the employee
                                // used the wrong bio process/type.
                                var lateNightAnchor = todays
                                    .Where(x => (IsInType(x) || IsOutType(x))
                                             && x.Dt.TimeOfDay >= new TimeSpan(18, 0, 0)
                                             && x.Dt.TimeOfDay < new TimeSpan(22, 0, 0))
                                    .Select(x => (DateTime?)x.Dt)
                                    .FirstOrDefault();

                                var nextMorningPunch = nextDay
                                    .Where(x => (IsInType(x) || IsOutType(x)) && x.Dt.TimeOfDay <= new TimeSpan(5, 30, 0))
                                    .Select(x => (DateTime?)x.Dt)
                                    .FirstOrDefault();

                                if (lateNightAnchor.HasValue &&
                                    nextMorningPunch.HasValue &&
                                    nextMorningPunch.Value > lateNightAnchor.Value)
                                {
                                    int straightDutyNightWork = OverlapMinutes(
                                        lateNightAnchor.Value,
                                        nextMorningPunch.Value,
                                        day.AddHours(20),
                                        day.AddDays(1).AddHours(4));

                                    if (straightDutyNightWork > 0)
                                    {
                                        otBest = (lateNightAnchor, nextMorningPunch, straightDutyNightWork);

                                        // Keep the late-night punch in Shift 3, not Shift 2 OUT.
                                        if (pmBest.Out.HasValue && pmBest.Out.Value == lateNightAnchor.Value)
                                            pmBest = (pmBest.In, null, pmBest.Work);
                                    }
                                }

                                // Emergency continuation fallback for Shift 1:
                                // If no AM IN but AM OUT exists, carry previous-night IN.
                                if (!amBest.In.HasValue && amBest.Out.HasValue)
                                {
                                    var carryIn = prevDay
                                        .Where(x => IsInType(x)
                                                 && x.Dt >= day.AddDays(-1).AddHours(22)
                                                 && x.Dt <= day.AddHours(8))
                                        .Select(x => (DateTime?)x.Dt)
                                        .LastOrDefault();
                                    if (carryIn.HasValue && amBest.Out.Value > carryIn.Value)
                                    {
                                        int w1 = OverlapMinutes(carryIn.Value, amBest.Out.Value, day.AddHours(7), day.AddHours(16));
                                        int w2 = OverlapMinutes(carryIn.Value, amBest.Out.Value, day.AddHours(8), day.AddHours(17));
                                        int w3 = OverlapMinutes(carryIn.Value, amBest.Out.Value, day.AddHours(7), day.AddHours(15));
                                        int emergencyAmWork = Math.Max(w1, Math.Max(w2, w3));
                                        if (emergencyAmWork > 0)
                                        {
                                            amBest = (carryIn, amBest.Out, emergencyAmWork);
                                        }
                                    }
                                }

                                // Emergency continuation fallback:
                                // If employee extends Shift 1 into Shift 3 (no new IN on Shift 3),
                                // use the latest night IN together with Shift 3 OUT so night duty is not blank.
                                if (!otBest.In.HasValue && otBest.Out.HasValue && pmBest.In.HasValue && otBest.Out.Value > pmBest.In.Value)
                                {
                                    DateTime inheritIn = pmBest.In.Value;
                                    DateTime outNight = otBest.Out.Value;
                                    int emergencyNightWork = OverlapMinutes(
                                        inheritIn,
                                        outNight,
                                        day.AddHours(20),
                                        day.AddDays(1).AddHours(4));
                                    if (emergencyNightWork > 0)
                                    {
                                        otBest = (inheritIn, outNight, emergencyNightWork);
                                    }
                                }

                                // If an overnight pair was captured in Shift 1, it really belongs to Shift 3.
                                // This happens with human-error biometrics where the guard used normal IN/OUT
                                // instead of OT IN/OT OUT around 8:00 PM to 4:00 AM.
                                if (amBest.In.HasValue &&
                                    amBest.Out.HasValue &&
                                    amBest.Out.Value.Date > day.Date &&
                                    amBest.In.Value.TimeOfDay >= new TimeSpan(18, 0, 0) &&
                                    amBest.In.Value.TimeOfDay < new TimeSpan(22, 0, 0))
                                {
                                    if (!otBest.In.HasValue || !otBest.Out.HasValue || otBest.Work < amBest.Work)
                                        otBest = amBest;

                                    amBest = (null, null, 0);
                                }

                                if (otBest.In.HasValue &&
                                    otBest.Out.HasValue &&
                                    otBest.Out.Value.Date > day.Date)
                                {
                                    if (amBest.In.HasValue &&
                                        amBest.Out.HasValue &&
                                        amBest.In.Value == otBest.In.Value &&
                                        amBest.Out.Value == otBest.Out.Value)
                                    {
                                        amBest = (null, null, 0);
                                    }

                                    if (pmBest.In.HasValue &&
                                        pmBest.Out.HasValue &&
                                        pmBest.In.Value == otBest.In.Value &&
                                        pmBest.Out.Value == otBest.Out.Value)
                                    {
                                        pmBest = (null, null, 0);
                                    }

                                    if (pmBest.Out.HasValue && pmBest.Out.Value == otBest.In.Value)
                                    {
                                        pmBest = (pmBest.In, null, pmBest.Work);
                                    }
                                }

                                // Safety fallback:
                                // If this day has punches but no shift window matched, keep the day visible
                                // by pairing first IN + last OUT of the same calendar day.
                                if (amBest.Work == 0 && pmBest.Work == 0 && otBest.Work == 0)
                                {
                                    var dayIn = todays.Where(IsInType).Select(x => (DateTime?)x.Dt).FirstOrDefault();
                                    var dayOut = todays.Where(IsOutType).Select(x => (DateTime?)x.Dt).LastOrDefault();

                                    var nextDayEarlyOutFallback = nextDay
                                        .Where(x => IsOutType(x) && x.Dt.TimeOfDay <= new TimeSpan(7, 30, 0))
                                        .Select(x => (DateTime?)x.Dt)
                                        .FirstOrDefault();

                                    // Guard-only human-error case:
                                    // 8PM-area IN on this day + early OUT next day should be Shift 3,
                                    // not a fake Shift 1 row with 480 undertime.
                                    if (dayIn.HasValue &&
                                        dayIn.Value.TimeOfDay >= new TimeSpan(18, 0, 0) &&
                                        dayIn.Value.TimeOfDay < new TimeSpan(22, 0, 0) &&
                                        nextDayEarlyOutFallback.HasValue &&
                                        nextDayEarlyOutFallback.Value > dayIn.Value)
                                    {
                                        int nightWork = OverlapMinutes(
                                            dayIn.Value,
                                            nextDayEarlyOutFallback.Value,
                                            day.AddHours(20),
                                            day.AddDays(1).AddHours(4));

                                        if (nightWork > 0)
                                        {
                                            otBest = (dayIn, nextDayEarlyOutFallback, nightWork);
                                        }
                                        else
                                        {
                                            otBest = (dayIn, nextDayEarlyOutFallback, 0);
                                        }
                                    }
                                    else
                                    {
                                        if (dayIn.HasValue && dayOut.HasValue && dayOut.Value > dayIn.Value)
                                        {
                                            int dayWork = Math.Min(480, (int)(dayOut.Value - dayIn.Value).TotalMinutes);
                                            // Put fallback into Shift 1 columns so print is not blank/missing.
                                            amBest = (dayIn, dayOut, dayWork);
                                        }
                                        else
                                        {
                                            // Lone punch fallback: still show available IN/OUT instead of blank day.
                                            if (dayIn.HasValue || dayOut.HasValue)
                                                amBest = (dayIn, dayOut, 0);
                                        }
                                    }
                                }

                                var forcedThirdShiftIn = todays
                                    .Where(x => (IsInType(x) || IsOutType(x))
                                             && x.Dt.TimeOfDay >= new TimeSpan(18, 0, 0)
                                             && x.Dt.TimeOfDay < new TimeSpan(22, 0, 0))
                                    .Select(x => (DateTime?)x.Dt)
                                    .FirstOrDefault();

                                var forcedThirdShiftOut = nextDay
                                    .Where(x => (IsInType(x) || IsOutType(x)) && x.Dt.TimeOfDay <= new TimeSpan(5, 30, 0))
                                    .Select(x => (DateTime?)x.Dt)
                                    .FirstOrDefault();

                                if (forcedThirdShiftIn.HasValue &&
                                    forcedThirdShiftOut.HasValue &&
                                    forcedThirdShiftOut.Value > forcedThirdShiftIn.Value)
                                {
                                    int forcedThirdShiftWork = OverlapMinutes(
                                        forcedThirdShiftIn.Value,
                                        forcedThirdShiftOut.Value,
                                        day.AddHours(20),
                                        day.AddDays(1).AddHours(4));

                                    if (forcedThirdShiftWork > 0)
                                    {
                                        otBest = (forcedThirdShiftIn, forcedThirdShiftOut, forcedThirdShiftWork);
                                        amBest = (null, null, 0);

                                        if (pmBest.Out.HasValue && pmBest.Out.Value == forcedThirdShiftIn.Value)
                                            pmBest = (pmBest.In, null, pmBest.Work);
                                    }
                                }

                                amIn = amBest.In; amOut = amBest.Out;
                                pmIn = pmBest.In; pmOut = pmBest.Out;
                                otIn = otBest.In; otOut = otBest.Out;

                                // Time-based correction for Security Guard:
                                // if a pair looks like real overnight duty (late-night to next-morning),
                                // trust the time pattern more than the raw CHECKTYPE.
                                bool amLooksLikeShift3 =
                                    amIn.HasValue &&
                                    amOut.HasValue &&
                                    amIn.Value.TimeOfDay >= new TimeSpan(18, 0, 0) &&
                                    amIn.Value.TimeOfDay < new TimeSpan(22, 0, 0) &&
                                    amOut.Value.Date > day.Date &&
                                    amOut.Value.TimeOfDay <= new TimeSpan(5, 30, 0);

                                if (amLooksLikeShift3)
                                {
                                    otIn = amIn;
                                    otOut = amOut;
                                    amIn = null;
                                    amOut = null;
                                }

                                bool pmLooksLikeShift3 =
                                    pmIn.HasValue &&
                                    pmOut.HasValue &&
                                    pmIn.Value.TimeOfDay >= new TimeSpan(18, 0, 0) &&
                                    pmIn.Value.TimeOfDay < new TimeSpan(22, 0, 0) &&
                                    pmOut.Value.Date > day.Date &&
                                    pmOut.Value.TimeOfDay <= new TimeSpan(5, 30, 0);

                                if (pmLooksLikeShift3)
                                {
                                    otIn = pmIn;
                                    otOut = pmOut;
                                    pmIn = null;
                                    pmOut = null;
                                }

                                // Final guard-only cleanup:
                                // If the chosen duty is an overnight Shift 3 pair, force it out of Shift 1.
                                if (otIn.HasValue &&
                                    otOut.HasValue &&
                                    otOut.Value.Date > day.Date &&
                                    otIn.Value.TimeOfDay >= new TimeSpan(18, 0, 0) &&
                                    otIn.Value.TimeOfDay < new TimeSpan(22, 0, 0))
                                {
                                    amIn = null;
                                    amOut = null;

                                    if (pmOut.HasValue && pmOut.Value == otIn.Value)
                                        pmOut = null;
                                }

                                otMinutes = otBest.Work;
                                AM_START = day.AddHours(7); AM_END = day.AddHours(15);
                                PM_START = day.AddHours(23); PM_END = day.AddDays(1).AddHours(7);

                                int workedBestShift = Math.Max(amBest.Work, Math.Max(pmBest.Work, otBest.Work));
                                bool hasAnyPunchShift = all.Any();
                                bool isWeekendDayShift = (day.DayOfWeek == DayOfWeek.Saturday || day.DayOfWeek == DayOfWeek.Sunday);
                                bool isFutureDayShift = day.Date > DateTime.Today;

                                int shiftUT = hasAnyPunchShift ? Math.Max(0, 480 - workedBestShift) : 480;
                                if (isWeekendDayShift && !hasAnyPunchShift) shiftUT = 0;
                                if (isFutureDayShift && !hasAnyPunchShift) shiftUT = 0;

                                lateAllowanceRemaining = 60; // do not consume regular-office allowance in shift mode

                                var rowShift = dt.NewRow();
                                rowShift["userID"] = uidInt.Value.ToString();
                                rowShift["WorkDate"] = day;
                                rowShift["Morning_IN"] = fmt(amIn);
                                rowShift["Morning_OUT"] = fmt(amOut);
                                rowShift["Afternoon_IN"] = fmt(pmIn);
                                rowShift["Afternoon_OUT"] = fmt(pmOut);
                                rowShift["OT_IN"] = fmt(otIn);
                                rowShift["OT_OUT"] = fmt(otOut);
                                rowShift["Morning_IN_Area"] = areaOf(todays, amIn, "I");
                                rowShift["Morning_OUT_Area"] = areaOfAnyType(todays.Concat(nextDay).ToList(), amOut);
                                rowShift["Afternoon_IN_Area"] = areaOf(todays, pmIn, "I");
                                rowShift["Afternoon_OUT_Area"] = areaOfAnyType(todays.Concat(nextDay).ToList(), pmOut);
                                rowShift["OT_IN_Area"] = areaOf(todays, otIn, "I");
                                rowShift["OT_OUT_Area"] = areaOfAnyType(todays.Concat(nextDay).ToList(), otOut);
                                rowShift["WorkedMinutes"] = Math.Min(480, workedBestShift);
                                rowShift["Undertime_Min"] = shiftUT;
                                rowShift["Late_Min"] = 0;
                                rowShift["LateCount"] = shiftUT;
                                rowShift["DailyPay"] = Math.Round(Math.Max(0m, perDay - Math.Round(shiftUT * perMinute, 2)), 2);
                                rowShift["PerHour"] = perHour;
                                rowShift["PerMinute"] = perMinute;
                                rowShift["OT_Minutes"] = otMinutes;
                                dt.Rows.Add(rowShift);
                                continue;
                            }

                            DateTime S1_START = day.AddHours(7);
                            DateTime S1_END = day.AddHours(15);
                            DateTime S2_START = day.AddHours(15);
                            DateTime S2_END = day.AddHours(23);
                            DateTime S3_START = day.AddHours(22);
                            DateTime S3_END = day.AddDays(1).AddHours(8);

                            bool HasPreviousNightDutyCandidate(DateTime earlyPunch)
                            {
                                return prevDay.Any(x => (IsInType(x) || IsOutType(x))
                                                     && x.Dt.TimeOfDay >= new TimeSpan(18, 0, 0)
                                                     && x.Dt < earlyPunch
                                                     && (earlyPunch - x.Dt).TotalHours >= 4
                                                     && (earlyPunch - x.Dt).TotalHours <= 14);
                            }

                            var s1In = todays.Where(x => IsInType(x)
                                                      && x.Dt.TimeOfDay >= new TimeSpan(5, 0, 0)
                                                      && x.Dt.TimeOfDay <= new TimeSpan(9, 59, 59)
                                                      && !(x.Dt.TimeOfDay <= new TimeSpan(8, 0, 0) && HasPreviousNightDutyCandidate(x.Dt)))
                                             .Select(x => (DateTime?)x.Dt).FirstOrDefault();

                            // Allow small overtime/clock drift after 5:00 PM for Shift 1 OUT.
                            // Shift 1 OUT: base on actual IN->OUT span first (mixed schedules),
                            // fallback to nearest schedule target.
                            var s1OutCandidates = todays
                                .Where(x => IsShiftEndOutType(x) && x.Dt.TimeOfDay >= new TimeSpan(14, 0, 0) && x.Dt.TimeOfDay <= new TimeSpan(21, 30, 0))
                                .Select(x => x.Dt)
                                .ToList();
                            var s1Out = PickOutByPattern(s1In, s1OutCandidates, day.AddHours(15));

                            var s2In = todays.Where(x => IsInType(x) && x.Dt.TimeOfDay >= new TimeSpan(13, 0, 0) && x.Dt.TimeOfDay <= new TimeSpan(17, 59, 59))
                                             .Select(x => (DateTime?)x.Dt).FirstOrDefault();

                            // Shift 2 OUT: base on actual IN->OUT span first, then schedule fallback.
                            // Include early next-day OUT for Shift 2 extensions (e.g., 00:xx-03:xx).
                            var s2OutCandidates = todays.Concat(nextDay)
                                .Where(x => IsShiftEndOutType(x)
                                            && x.Dt >= day.AddHours(21.5)
                                            && x.Dt <= day.AddDays(1).AddHours(3.5))
                                .Select(x => x.Dt)
                                .ToList();
                            var s2Out = PickOutByPattern(s2In, s2OutCandidates, day.AddHours(23));

                            // Substation/Maintenance night duty sometimes has the wrong device mode:
                            // the 10PM start can be saved as OUT/o even though it is really Shift 3 IN.
                            var s3In = todays.Where(x => IsInType(x) && x.Dt.TimeOfDay >= new TimeSpan(18, 0, 0))
                                             .Select(x => (DateTime?)x.Dt).FirstOrDefault();

                            if (!s3In.HasValue)
                            {
                                s3In = todays.Where(x => IsOutType(x)
                                                      && x.Dt.TimeOfDay >= new TimeSpan(18, 0, 0)
                                                      && nextDay.Any(n =>
                                                             n.Dt.TimeOfDay <= new TimeSpan(8, 0, 0) &&
                                                             (IsOutType(n) || IsInType(n)) &&
                                                             n.Dt > x.Dt &&
                                                             (n.Dt - x.Dt).TotalHours >= 4 &&
                                                             (n.Dt - x.Dt).TotalHours <= 14))
                                                 .Select(x => (DateTime?)x.Dt)
                                                 .FirstOrDefault();
                            }

                            // Shift 3 OUT: base on actual IN->OUT span first, then schedule fallback.
                            // Use only OUT punches here so the next day's Shift 1 IN is not stolen
                            // as the previous night's Shift 3 OUT.
                            var s3OutCandidates = nextDay
                                .Where(x => x.Dt.TimeOfDay <= new TimeSpan(8, 0, 0)
                                            && (IsOutType(x) ||
                                                (s3In.HasValue && IsInType(x) &&
                                                 x.Dt > s3In.Value &&
                                                 (x.Dt - s3In.Value).TotalHours >= 4 &&
                                                 (x.Dt - s3In.Value).TotalHours <= 14)))
                                .Select(x => x.Dt)
                                .ToList();
                            var s3Out = PickOutByPattern(s3In, s3OutCandidates, day.AddDays(1).AddHours(8));

                            // Night duty follows the date where the duty starts.
                            // Example: Monday 10:17 PM to Tuesday 7:06 AM prints on Monday Shift 3.

                            // Emergency continuation fallback:
                            // Shift 3 (previous day) continues into Shift 1 with no new Shift 1 IN.
                            if (!s1In.HasValue && s1Out.HasValue)
                            {
                                s1In = prevDay.Where(x => IsInType(x)
                                                    && x.Dt >= day.AddDays(-1).AddHours(20)
                                                    && x.Dt <= day.AddHours(8))
                                              .Select(x => (DateTime?)x.Dt)
                                              .LastOrDefault();
                            }

                            // Emergency continuation fallback:
                            // Shift 2 continues into Shift 3 with no new Shift 3 IN.
                            if (!s3In.HasValue && s2In.HasValue && s3Out.HasValue && s3Out.Value > s2In.Value)
                            {
                                s3In = s2In;
                            }

                            if (s1In.HasValue &&
                                s1Out.HasValue &&
                                s1Out.Value.Date > day.Date &&
                                s1In.Value.TimeOfDay >= new TimeSpan(20, 0, 0) &&
                                s1Out.Value.TimeOfDay <= new TimeSpan(8, 0, 0))
                            {
                                s3In = s1In;
                                s3Out = s1Out;
                                s1In = null;
                                s1Out = null;
                            }

                            if (s2In.HasValue &&
                                s2Out.HasValue &&
                                s2Out.Value.Date > day.Date &&
                                s2In.Value.TimeOfDay >= new TimeSpan(20, 0, 0) &&
                                s2Out.Value.TimeOfDay <= new TimeSpan(8, 0, 0))
                            {
                                s3In = s2In;
                                s3Out = s2Out;
                                s2In = null;
                                s2Out = null;
                            }

                            amIn = s1In; amOut = s1Out;
                            pmIn = s2In; pmOut = s2Out;
                            otIn = s3In; otOut = s3Out;

                            int FlexibleShiftMinutes(DateTime? inTime, DateTime? outTime)
                            {
                                if (!inTime.HasValue || !outTime.HasValue || outTime.Value <= inTime.Value)
                                    return 0;

                                // Shift workers do not always follow one fixed window.
                                // Credit the real paired duty span and cap to one standard 8-hour duty.
                                return Math.Min(480, (int)(outTime.Value - inTime.Value).TotalMinutes);
                            }

                            int workS1 = FlexibleShiftMinutes(s1In, s1Out);
                            int workS2 = FlexibleShiftMinutes(s2In, s2Out);
                            int workS3 = FlexibleShiftMinutes(s3In, s3Out);

                            otMinutes = workS3;

                            AM_START = S1_START; AM_END = S1_END;
                            PM_START = S2_START; PM_END = S2_END;

                            // For shift workers, undertime is based on one scheduled 8-hour shift/day.
                            // Choose the shift with highest captured work minutes.
                            int workedBestShiftStd = Math.Max(workS1, Math.Max(workS2, workS3));
                            bool hasAnyPunchShiftStd = s1In.HasValue || s1Out.HasValue || s2In.HasValue || s2Out.HasValue || s3In.HasValue || s3Out.HasValue;
                            bool isWeekendDayShiftStd = (day.DayOfWeek == DayOfWeek.Saturday || day.DayOfWeek == DayOfWeek.Sunday);
                            bool isMaintenanceRestDayWithoutDuty =
                                isMaintenanceWorker &&
                                !hasAnyPunchShiftStd &&
                                (day.DayOfWeek == DayOfWeek.Sunday || day.DayOfWeek == DayOfWeek.Monday);
                            bool isFutureDayShiftStd = day.Date > DateTime.Today;

                            int shiftUTStd = hasAnyPunchShiftStd ? Math.Max(0, 480 - workedBestShiftStd) : 480;
                            if (isWeekendDayShiftStd && !hasAnyPunchShiftStd) shiftUTStd = 0;
                            if (isMaintenanceRestDayWithoutDuty) shiftUTStd = 0;
                            if (isFutureDayShiftStd && !hasAnyPunchShiftStd) shiftUTStd = 0;

                            // Keep late-focused columns neutral for shift setup; undertime is the key metric.
                            lateAllowanceRemaining = 60; // do not consume regular-office allowance in shift mode

                            var rowShiftStd = dt.NewRow();
                            rowShiftStd["userID"] = uidInt.Value.ToString();
                            rowShiftStd["WorkDate"] = day;
                            rowShiftStd["Morning_IN"] = fmt(amIn);
                            rowShiftStd["Morning_OUT"] = fmt(amOut);
                            rowShiftStd["Afternoon_IN"] = fmt(pmIn);
                            rowShiftStd["Afternoon_OUT"] = fmt(pmOut);
                            rowShiftStd["OT_IN"] = fmt(otIn);
                            rowShiftStd["OT_OUT"] = fmt(otOut);
                            rowShiftStd["Morning_IN_Area"] = areaOf(todays, amIn, "I");
                            rowShiftStd["Morning_OUT_Area"] = areaOfAnyType(todays.Concat(nextDay).ToList(), amOut);
                            rowShiftStd["Afternoon_IN_Area"] = areaOf(todays, pmIn, "I");
                            rowShiftStd["Afternoon_OUT_Area"] = areaOfAnyType(todays.Concat(nextDay).ToList(), pmOut);
                            rowShiftStd["OT_IN_Area"] = areaOfAnyType(prevDay.Concat(todays).ToList(), otIn);
                            rowShiftStd["OT_OUT_Area"] = areaOfAnyType(todays.Concat(nextDay).ToList(), otOut);
                            rowShiftStd["WorkedMinutes"] = Math.Min(480, workedBestShiftStd);
                            rowShiftStd["Undertime_Min"] = shiftUTStd;
                            rowShiftStd["Late_Min"] = 0;
                            rowShiftStd["LateCount"] = shiftUTStd;
                            rowShiftStd["DailyPay"] = Math.Round(Math.Max(0m, perDay - Math.Round(shiftUTStd * perMinute, 2)), 2);
                            rowShiftStd["PerHour"] = perHour;
                            rowShiftStd["PerMinute"] = perMinute;
                            rowShiftStd["OT_Minutes"] = otMinutes;
                            dt.Rows.Add(rowShiftStd);
                            continue;
                        }

                        var intervals = new List<Tuple<DateTime, DateTime>>();
                        if (amIn.HasValue && amOut.HasValue) intervals.Add(Tuple.Create(amIn.Value, amOut.Value));
                        if (pmIn.HasValue && pmOut.HasValue) intervals.Add(Tuple.Create(pmIn.Value, pmOut.Value));

                        bool lunchMissing = (!amOut.HasValue || !pmIn.HasValue);
                        if (amIn.HasValue && pmOut.HasValue && lunchMissing && !(amOut.HasValue && pmIn.HasValue))
                            intervals.Add(Tuple.Create(amIn.Value, pmOut.Value));

                        int workedAM = 0, workedPM = 0;
                        foreach (var it in intervals)
                        {
                            var s = it.Item1; var e = it.Item2;
                            if (e <= s) continue;
                            workedAM += OverlapMinutes(s, e, AM_START, AM_END);
                            workedPM += OverlapMinutes(s, e, PM_START, PM_END);
                        }
                        int workedTotal = Math.Max(0, Math.Min(480, workedAM + workedPM));

                        DateTime? amOutForUT = amOut;
                        DateTime? pmInForLate = pmIn;
                        if (!amOutForUT.HasValue && (pmIn.HasValue || pmOut.HasValue)) amOutForUT = AM_END;
                        if (!pmInForLate.HasValue && (amIn.HasValue || amOut.HasValue)) pmInForLate = PM_START;

                        if (isTellerWorker)
                        {
                            DateTime tellerLunchWindowStart = day.AddHours(11);
                            DateTime tellerLunchWindowEnd = day.AddHours(14);

                            bool amOutInsideWindow =
                                amOut.HasValue &&
                                amOut.Value >= tellerLunchWindowStart &&
                                amOut.Value <= tellerLunchWindowEnd;

                            bool pmInInsideWindow =
                                pmIn.HasValue &&
                                pmIn.Value >= tellerLunchWindowStart &&
                                pmIn.Value <= tellerLunchWindowEnd;

                            if (amOutInsideWindow || pmInInsideWindow)
                            {
                                // Tellers should not get noon undertime/late charges for lunch-window punches.
                                // Any AM OUT or PM IN between 11:00 AM and 2:00 PM is treated as an allowed
                                // lunch-window movement, so noon undertime stays zero.
                                amOutForUT = AM_END;
                                pmInForLate = PM_START;
                            }
                        }

                        // Regular office: AM OUT between 10:00 AM and noon is treated as a lunch-boundary
                        // exit for undertime (credit to scheduled noon), similar to teller lunch handling.
                        if (!isTellerWorker && amOut.HasValue && amIn.HasValue)
                        {
                            TimeSpan lunchOutTod = amOut.Value.TimeOfDay;
                            if (lunchOutTod >= new TimeSpan(10, 0, 0) && lunchOutTod <= new TimeSpan(12, 0, 0))
                                amOutForUT = AM_END;
                        }

                        TimeSpan lunchGrace = TimeSpan.FromMinutes(2);
                        if (amOutForUT.HasValue && Math.Abs((AM_END - amOutForUT.Value).TotalMinutes) <= lunchGrace.TotalMinutes) amOutForUT = AM_END;
                        if (pmInForLate.HasValue && Math.Abs((pmInForLate.Value - PM_START).TotalMinutes) <= lunchGrace.TotalMinutes) pmInForLate = PM_START;

                        int lateAM = amIn.HasValue ? Math.Max(0, (int)(amIn.Value - AM_START).TotalMinutes) : capHalf;
                        lateAM = Math.Min(lateAM, capHalf);

                        int latePM = pmInForLate.HasValue ? Math.Max(0, (int)(pmInForLate.Value - PM_START).TotalMinutes) : capHalf;
                        latePM = Math.Min(latePM, capHalf);

                        int utAM = amOutForUT.HasValue ? Math.Max(0, (int)(AM_END - amOutForUT.Value).TotalMinutes) : capHalf;
                        utAM = Math.Min(utAM, capHalf);

                        int utPM = pmOut.HasValue ? Math.Max(0, (int)(PM_END - pmOut.Value).TotalMinutes) : capHalf;
                        utPM = Math.Min(utPM, capHalf);

                        int capAM = Math.Min(capHalf, lateAM + utAM);
                        int capPM = Math.Min(capHalf, latePM + utPM);

                        int totalLateRaw = lateAM + latePM;
                        int totalUT = utAM + utPM;

                        // If middle punches are missing but we have a continuous day span (AM IN + PM OUT),
                        // compute undertime from total worked minutes so partial days are not shown as UT=0.
                        bool hasContinuousTwoPunch = amIn.HasValue && pmOut.HasValue && (!amOut.HasValue || !pmIn.HasValue);
                        if (hasContinuousTwoPunch)
                        {
                            int utFromWorked = Math.Max(0, 480 - workedTotal);
                            totalUT = Math.Max(totalUT, utFromWorked);
                        }

                        int lateAfterAllowance = totalLateRaw;
                        if (lateAfterAllowance > 0 && lateAllowanceRemaining > 0)
                        {
                            int deduct = Math.Min(lateAllowanceRemaining, lateAfterAllowance);
                            lateAfterAllowance -= deduct;
                            lateAllowanceRemaining -= deduct;
                        }

                        int lateAllMinutes = Math.Min(480, lateAfterAllowance + totalUT);
                        int visibleUndertime = Math.Min(480, totalUT);
                        int chargeMin = Math.Min(capHalf, Math.Min(240, capAM)) + Math.Min(capHalf, Math.Min(240, capPM));

                        bool hasAnyPunch = (amIn.HasValue || amOut.HasValue || pmIn.HasValue || pmOut.HasValue || otIn.HasValue || otOut.HasValue);
                        bool isWeekendDay = (day.DayOfWeek == DayOfWeek.Saturday || day.DayOfWeek == DayOfWeek.Sunday);
                        bool isFutureDay = day.Date > DateTime.Today;
                        if (isWeekendDay && !hasAnyPunch)
                        {
                            workedTotal = 0;
                            totalUT = 0;
                            visibleUndertime = 0;
                            lateAfterAllowance = 0;
                            lateAllMinutes = 0;
                            chargeMin = 0;
                            otMinutes = 0;
                        }
                        else if (isFutureDay && !hasAnyPunch)
                        {
                            // Future dates with no logs should stay blank (not counted as undertime yet).
                            workedTotal = 0;
                            totalUT = 0;
                            visibleUndertime = 0;
                            lateAfterAllowance = 0;
                            lateAllMinutes = 0;
                            chargeMin = 0;
                            otMinutes = 0;
                        }

                        decimal deduction = Math.Round(chargeMin * perMinute, 2);
                        decimal dailyPay = (isWeekendDay && !hasAnyPunch) ? 0m : Math.Round(Math.Max(0m, perDay - deduction), 2);

                        var row = dt.NewRow();
                        row["userID"] = uidInt.Value.ToString();
                        row["WorkDate"] = day;
                        row["Morning_IN"] = fmt(amIn);
                        row["Morning_OUT"] = fmt(amOut);
                        row["Afternoon_IN"] = fmt(pmIn);
                        row["Afternoon_OUT"] = fmt(pmOut);
                        row["OT_IN"] = fmt(otIn);
                        row["OT_OUT"] = fmt(otOut);
                        row["Morning_IN_Area"] = areaOf(todays, amIn, amInAreaType);
                        row["Morning_OUT_Area"] = areaOf(todays, amOut, "O");
                        row["Afternoon_IN_Area"] = areaOf(todays, pmIn, pmInAreaType);
                        row["Afternoon_OUT_Area"] = areaOfAnyType(todays, pmOut);
                        row["OT_IN_Area"] = areaOf(todays, otIn, "i");
                        row["OT_OUT_Area"] = areaOf(
                            (otOut.HasValue && otOut.Value.Date > day.Date) ? nextDay : (isShiftWorker ? nextDay : todays),
                            otOut,
                            "o");
                        row["WorkedMinutes"] = workedTotal;
                        // Display undertime-only minutes in Undertertime_Min.
                        // Late minutes remain in Late_Min / LateCount.
                        row["Undertime_Min"] = visibleUndertime;
                        row["Late_Min"] = lateAfterAllowance;
                        row["LateCount"] = lateAllMinutes;
                        row["DailyPay"] = dailyPay;
                        row["PerHour"] = perHour;
                        row["PerMinute"] = perMinute;
                        row["OT_Minutes"] = otMinutes;

                        dt.Rows.Add(row);
                    }

                    dt.DefaultView.Sort = "userID ASC, WorkDate ASC";
                    dt = dt.DefaultView.ToTable();
                }

                return dt;
            }



















        }




        private void SetupDTRGrid()
        {
            dtrlist.Columns.Clear();
            dtrlist.AutoGenerateColumns = false;
            dtrlist.AllowUserToAddRows = false;
            dtrlist.RowHeadersVisible = false;
            dtrlist.AllowUserToResizeColumns = true;
            dtrlist.ScrollBars = ScrollBars.Both;

            dtrlist.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.EnableResizing;
            dtrlist.ColumnHeadersHeight = 36;
            dtrlist.ColumnHeadersDefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleCenter;

            dtrlist.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None;
            dtrlist.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleCenter;
            dtrlist.DefaultCellStyle.Font = new Font("Segoe UI", 10F);
            dtrlist.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI Semibold", 10.5F);
            dtrlist.RowTemplate.Height = 32;

            dtrlist.Columns.Add(new DataGridViewTextBoxColumn { Name = "userID", HeaderText = "User ID", DataPropertyName = "userID", Width = 70, Frozen = true });
            dtrlist.Columns.Add(new DataGridViewTextBoxColumn { Name = "WorkDate", HeaderText = "Work Date", DataPropertyName = "WorkDate", Width = 110, Frozen = true, DefaultCellStyle = new DataGridViewCellStyle { Format = "MM/dd/yyyy" } });

            string tfmt = "h:mm";
            dtrlist.Columns.Add(new DataGridViewTextBoxColumn { Name = "Morning_IN", HeaderText = "AM IN", DataPropertyName = "Morning_IN", Width = 90, DefaultCellStyle = new DataGridViewCellStyle { Format = tfmt } });
            dtrlist.Columns.Add(new DataGridViewTextBoxColumn { Name = "Morning_OUT", HeaderText = "AM OUT", DataPropertyName = "Morning_OUT", Width = 90, DefaultCellStyle = new DataGridViewCellStyle { Format = tfmt } });
            dtrlist.Columns.Add(new DataGridViewTextBoxColumn { Name = "Afternoon_IN", HeaderText = "PM IN", DataPropertyName = "Afternoon_IN", Width = 90, DefaultCellStyle = new DataGridViewCellStyle { Format = tfmt } });
            dtrlist.Columns.Add(new DataGridViewTextBoxColumn { Name = "Afternoon_OUT", HeaderText = "PM OUT", DataPropertyName = "Afternoon_OUT", Width = 90, DefaultCellStyle = new DataGridViewCellStyle { Format = tfmt } });

            dtrlist.Columns.Add(new DataGridViewTextBoxColumn { Name = "OT_IN", HeaderText = "OT IN", DataPropertyName = "OT_IN", Width = 90, DefaultCellStyle = new DataGridViewCellStyle { Format = tfmt } });
            dtrlist.Columns.Add(new DataGridViewTextBoxColumn { Name = "OT_OUT", HeaderText = "OT OUT", DataPropertyName = "OT_OUT", Width = 90, DefaultCellStyle = new DataGridViewCellStyle { Format = tfmt } });

            dtrlist.Columns.Add(new DataGridViewTextBoxColumn { Name = "WorkedMinutes", HeaderText = "Worked (Min)", DataPropertyName = "WorkedMinutes", Width = 110, ValueType = typeof(int), DefaultCellStyle = new DataGridViewCellStyle { Format = "N0", Alignment = DataGridViewContentAlignment.MiddleCenter } });

            dtrlist.Columns.Add(new DataGridViewTextBoxColumn { Name = "Undertime_Min", HeaderText = "Undertime (Min)", DataPropertyName = "Undertime_Min", Width = 120, ValueType = typeof(int), DefaultCellStyle = new DataGridViewCellStyle { Format = "N0", Alignment = DataGridViewContentAlignment.MiddleCenter } });

            dtrlist.Columns.Add(new DataGridViewTextBoxColumn { Name = "Late_Min", HeaderText = "Late (Min)", DataPropertyName = "Late_Min", Width = 100, ValueType = typeof(int), DefaultCellStyle = new DataGridViewCellStyle { Format = "N0", Alignment = DataGridViewContentAlignment.MiddleCenter } });

            dtrlist.Columns.Add(new DataGridViewTextBoxColumn { Name = "DailyPay", HeaderText = "Daily Pay (₱)", DataPropertyName = "DailyPay", Width = 120, DefaultCellStyle = new DataGridViewCellStyle { Format = "₱#,##0.00", Alignment = DataGridViewContentAlignment.MiddleRight } });

            dtrlist.Columns.Add(new DataGridViewTextBoxColumn { Name = "PerHour", HeaderText = "Per Hour (₱)", DataPropertyName = "PerHour", Width = 110, DefaultCellStyle = new DataGridViewCellStyle { Format = "₱#,##0.00", Alignment = DataGridViewContentAlignment.MiddleRight } });

            dtrlist.Columns.Add(new DataGridViewTextBoxColumn { Name = "PerMinute", HeaderText = "Per Minute (₱)", DataPropertyName = "PerMinute", Width = 110, DefaultCellStyle = new DataGridViewCellStyle { Format = "₱#,##0.00", Alignment = DataGridViewContentAlignment.MiddleRight } });

            dtrlist.Columns.Add(new DataGridViewTextBoxColumn { Name = "OT_Minutes", HeaderText = "OT (Min)", DataPropertyName = "OT_Minutes", Width = 80, ValueType = typeof(int), DefaultCellStyle = new DataGridViewCellStyle { Format = "N0", Alignment = DataGridViewContentAlignment.MiddleCenter } });

            // Optional: show how many sessions late
            dtrlist.Columns.Add(new DataGridViewTextBoxColumn { Name = "LateCount", HeaderText = "# Late", DataPropertyName = "LateCount", Width = 70, ValueType = typeof(int), DefaultCellStyle = new DataGridViewCellStyle { Alignment = DataGridViewContentAlignment.MiddleCenter } });
        }


        private void Dtrlist_CellFormatting(object sender, DataGridViewCellFormattingEventArgs e)
        {
            if (e.RowIndex < 0) return;
            var row = ((DataGridView)sender).Rows[e.RowIndex];

            int ut = 0, late = 0;
            int.TryParse(Convert.ToString(row.Cells["Undertime_Min"].Value), out ut);
            int.TryParse(Convert.ToString(row.Cells["Late_Min"].Value), out late);

            row.DefaultCellStyle.BackColor =
                (ut > 0 || late > 0) ? Color.FromArgb(255, 235, 238) : Color.FromArgb(230, 255, 230);
        }






















        private void LoadAllDepartments()
        {
            DataTable departments = MembershipDataHelper.GetDepartments();
            cmddepartment.Items.Clear();

            var blocked = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "CORPLAN",
                "SUBSTAION",
                "SUBSTATION",
                "CATBALOGAN SC",
                "SERVER CENTER",
                "SOLAR SUBSTATION",
                "CASUAL/EMERGENCY"
            };

            foreach (DataRow row in departments.Rows)
            {
                var dep = Convert.ToString(row["department"])?.Trim() ?? "";
                if (string.IsNullOrWhiteSpace(dep)) continue;
                if (blocked.Contains(dep)) continue;
                cmddepartment.Items.Add(dep);
            }

            // Position-based quick filter for DTR printing.
            if (!cmddepartment.Items.Cast<object>().Any(x => string.Equals(Convert.ToString(x), "Security Guard", StringComparison.OrdinalIgnoreCase)))
                cmddepartment.Items.Add("Security Guard");
            if (!cmddepartment.Items.Cast<object>().Any(x => string.Equals(Convert.ToString(x), "Substation Tender", StringComparison.OrdinalIgnoreCase)))
                cmddepartment.Items.Add("Substation Tender");
            if (!cmddepartment.Items.Cast<object>().Any(x => string.Equals(Convert.ToString(x), "Basey", StringComparison.OrdinalIgnoreCase)))
                cmddepartment.Items.Add("Basey");
            if (!cmddepartment.Items.Cast<object>().Any(x => string.Equals(Convert.ToString(x), "Villareal", StringComparison.OrdinalIgnoreCase)))
                cmddepartment.Items.Add("Villareal");
            if (!cmddepartment.Items.Cast<object>().Any(x => string.Equals(Convert.ToString(x), "Catbalogan", StringComparison.OrdinalIgnoreCase)))
                cmddepartment.Items.Add("Catbalogan");
            if (!cmddepartment.Items.Cast<object>().Any(x => string.Equals(Convert.ToString(x), "Basey TSD", StringComparison.OrdinalIgnoreCase)))
                cmddepartment.Items.Add("Basey TSD");
            if (!cmddepartment.Items.Cast<object>().Any(x => string.Equals(Convert.ToString(x), "Villareal TSD", StringComparison.OrdinalIgnoreCase)))
                cmddepartment.Items.Add("Villareal TSD");
            if (!cmddepartment.Items.Cast<object>().Any(x => string.Equals(Convert.ToString(x), "Catbalogan TSD", StringComparison.OrdinalIgnoreCase)))
                cmddepartment.Items.Add("Catbalogan TSD");
            if (!cmddepartment.Items.Cast<object>().Any(x => string.Equals(Convert.ToString(x), "MR/Collector", StringComparison.OrdinalIgnoreCase)))
                cmddepartment.Items.Add("MR/Collector");
            if (!cmddepartment.Items.Cast<object>().Any(x => string.Equals(Convert.ToString(x), "Disconnector", StringComparison.OrdinalIgnoreCase)))
                cmddepartment.Items.Add("Disconnector");

            if (cmddepartment.Items.Count > 0)
                cmddepartment.SelectedIndex = 0; // Default to the first department
        }




        private void LoadEmployeesByDepartment(string department)
        {
            DataTable employees = MembershipDataHelper.GetEmployeesByDepartment(department); // Pass the department here
            listemployee.Items.Clear();
            EnsureListEmployeeRemoveIcons();
            var addedBioUids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (DataRow row in employees.Rows)
            {
                string bioUid = Convert.ToString(row["bioUID"])?.Trim() ?? "";
                if (string.IsNullOrWhiteSpace(bioUid) || !addedBioUids.Add(bioUid))
                    continue;

                ListViewItem item = new ListViewItem(row["name"].ToString())
                {
                    Tag = bioUid // Store bioUID for DTR fetching
                };
                item.SubItems.Add(row["department"].ToString());
                item.SubItems.Add(bioUid);
                item.Checked = true;
                item.ImageKey = "remove";
                item.ToolTipText = "Double-click or press Delete to remove from print list";
                listemployee.Items.Add(item);
            }
        }





        private List<List<string>> dtrFormattedData = new List<List<string>>();
        // ✅ Load DTR data per department
        private void LoadDTRDataForDepartment(string department, DateTime startDate, DateTime endDate)
        {
            // Build a master table that matches the columns your grid expects
            var master = new DataTable();
            master.Columns.Add("userID", typeof(string));
            master.Columns.Add("WorkDate", typeof(DateTime));
            master.Columns.Add("Morning_IN", typeof(string));
            master.Columns.Add("Morning_OUT", typeof(string));
            master.Columns.Add("Afternoon_IN", typeof(string));
            master.Columns.Add("Afternoon_OUT", typeof(string));
            master.Columns.Add("OT_IN", typeof(string));
            master.Columns.Add("OT_OUT", typeof(string));
            master.Columns.Add("Morning_IN_Area", typeof(string));
            master.Columns.Add("Morning_OUT_Area", typeof(string));
            master.Columns.Add("Afternoon_IN_Area", typeof(string));
            master.Columns.Add("Afternoon_OUT_Area", typeof(string));
            master.Columns.Add("OT_IN_Area", typeof(string));
            master.Columns.Add("OT_OUT_Area", typeof(string));
            master.Columns.Add("WorkedMinutes", typeof(int));
            master.Columns.Add("Undertime_Min", typeof(int));  // minutes from OUT
            master.Columns.Add("Late_Min", typeof(int));       // minutes from IN
            master.Columns.Add("DailyPay", typeof(decimal));   // ₱
            master.Columns.Add("PerHour", typeof(decimal));    // ₱/hour
            master.Columns.Add("PerMinute", typeof(decimal));  // ₱/minute
            master.Columns.Add("OT_Minutes", typeof(int));

            // Get employees in department
            DataTable employees = MembershipDataHelper.GetEmployeesByDepartment(department);
            var addedBioUids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (DataRow empRow in employees.Rows)
            {
                string userId = Convert.ToString(empRow["bioUID"])?.Trim() ?? "";
                if (string.IsNullOrWhiteSpace(userId) || !addedBioUids.Add(userId))
                    continue;

                string position = Convert.ToString(empRow["position"]);

                // Pull DTR for this employee (this returns the same column names we need)
                DataTable dtrData = MembershipDataHelper.GetDTRData(userId, position, startDate, endDate, userId);

                // Copy rows into the master table, assigning by column name to avoid misalignment
                foreach (DataRow r in dtrData.Rows)
                {
                    var nr = master.NewRow();
                    nr["userID"] = r["userID"];
                    nr["WorkDate"] = r["WorkDate"];
                    nr["Morning_IN"] = r["Morning_IN"];
                    nr["Morning_OUT"] = r["Morning_OUT"];
                    nr["Afternoon_IN"] = r["Afternoon_IN"];
                    nr["Afternoon_OUT"] = r["Afternoon_OUT"];
                    nr["OT_IN"] = r["OT_IN"];
                    nr["OT_OUT"] = r["OT_OUT"];
                    nr["Morning_IN_Area"] = r["Morning_IN_Area"];
                    nr["Morning_OUT_Area"] = r["Morning_OUT_Area"];
                    nr["Afternoon_IN_Area"] = r["Afternoon_IN_Area"];
                    nr["Afternoon_OUT_Area"] = r["Afternoon_OUT_Area"];
                    nr["OT_IN_Area"] = r["OT_IN_Area"];
                    nr["OT_OUT_Area"] = r["OT_OUT_Area"];
                    nr["WorkedMinutes"] = r["WorkedMinutes"];
                    nr["Undertime_Min"] = r["Undertime_Min"];   // from OUT only
                    nr["Late_Min"] = r["Late_Min"];        // from IN only
                    nr["DailyPay"] = r["DailyPay"];
                    nr["PerHour"] = r["PerHour"];
                    nr["PerMinute"] = r["PerMinute"];
                    nr["OT_Minutes"] = r["OT_Minutes"];
                    master.Rows.Add(nr);
                }
            }

            // Optional: sort by user then date
            var view = master.DefaultView;
            view.Sort = "userID ASC, WorkDate ASC";

            // Bind once (don’t use Rows.Add when DataSource is set)
            dtrlist.DataSource = view.ToTable();
        }










        // --- helpers ---
        DateTime? TryParseDateTime(object val)
        {
            if (val == null || val == DBNull.Value) return null;
            DateTime dt;
            return DateTime.TryParse(val.ToString(), out dt) ? dt : (DateTime?)null;
        }

        void UpsertRow(string user, DateTime date, string mIn, string mOut, string aIn, string aOut, string otIn, string otOut, string otTotal)
        {
            string dateStr = date.ToString("MM/dd/yyyy");
            var existing = dtrlist.Rows.Cast<DataGridViewRow>()
                .FirstOrDefault(r => (r.Cells[0].Value?.ToString() ?? "") == user &&
                                     (r.Cells[1].Value?.ToString() ?? "") == dateStr);

            string total = CalculateUndertimeNew(mIn, mOut, aIn, aOut);

            if (existing == null)
            {
                // Columns in dtrlist:
                // 0 = User
                // 1 = Date
                // 2 = Morning IN  (I)
                // 3 = Morning OUT (O)
                // 4 = Afternoon IN  (I)
                // 5 = Afternoon OUT (O)
                // 6 = Undertime
                // 7 = OT IN  (i)
                // 8 = OT OUT (o)
                // 9 = OT Total
                dtrlist.Rows.Add(user, dateStr, mIn, mOut, aIn, aOut, total, otIn, otOut, otTotal);
            }
            else
            {
                if (string.IsNullOrEmpty(existing.Cells[2].Value?.ToString()) && !string.IsNullOrEmpty(mIn)) existing.Cells[2].Value = mIn;
                if (string.IsNullOrEmpty(existing.Cells[3].Value?.ToString()) && !string.IsNullOrEmpty(mOut)) existing.Cells[3].Value = mOut;
                if (string.IsNullOrEmpty(existing.Cells[4].Value?.ToString()) && !string.IsNullOrEmpty(aIn)) existing.Cells[4].Value = aIn;
                if (string.IsNullOrEmpty(existing.Cells[5].Value?.ToString()) && !string.IsNullOrEmpty(aOut)) existing.Cells[5].Value = aOut;

                // only lowercase i/o → cell7, cell8
                if (string.IsNullOrEmpty(existing.Cells[7].Value?.ToString()) && !string.IsNullOrEmpty(otIn)) existing.Cells[7].Value = otIn;
                if (string.IsNullOrEmpty(existing.Cells[8].Value?.ToString()) && !string.IsNullOrEmpty(otOut)) existing.Cells[8].Value = otOut;

                if (string.IsNullOrEmpty(existing.Cells[9].Value?.ToString()) && !string.IsNullOrEmpty(otTotal)) existing.Cells[9].Value = otTotal;

                string curMI = existing.Cells[2].Value?.ToString() ?? "";
                string curMO = existing.Cells[3].Value?.ToString() ?? "";
                string curAI = existing.Cells[4].Value?.ToString() ?? "";
                string curAO = existing.Cells[5].Value?.ToString() ?? "";

                existing.Cells[6].Value = CalculateUndertimeNew(curMI, curMO, curAI, curAO);
            }
        }








        // ---------- Helper ----------










        private string CalculateUndertimeNew(string morningIn, string morningOut,
                                      string afternoonIn, string afternoonOut)
        {
            // Shift ends
            TimeSpan pmStart = TimeSpan.FromHours(13); // 1:00 PM
            TimeSpan amEnd = TimeSpan.FromHours(12);   // 12:00
            TimeSpan pmEnd = TimeSpan.FromHours(17);   // 17:00

            // Helper: minutes from x to y (>= 0)
            int GapMinutes(TimeSpan from, TimeSpan to)
               => (int)Math.Max(0, (to - from).TotalMinutes);

            // --- AM undertime: depends ONLY on AM OUT ---
            int utAM;
            if (TryParsePunchTime(morningOut, out var amOutTs))
            {
                // if OUT is before 12:00 -> undertime = 12:00 - OUT; else 0
                utAM = GapMinutes(amOutTs, amEnd);
                if (utAM > 240) utAM = 240;            // cap per half-day
            }
            else
            {
                utAM = 240;                            // missing OUT → full AM UT
            }

            // --- PM undertime: depends ONLY on PM OUT ---
            int utPM;
            if (TryParsePunchTime(afternoonOut, out var pmOutTs))
            {
                utPM = GapMinutes(pmOutTs, pmEnd);     // before 17:00 → deficit; else 0
                if (utPM > 240) utPM = 240;
            }
            else
            {
                utPM = 240;                            // missing OUT → full PM UT
            }

            // PM start shortage must also appear in undertime-visible totals.
            // This keeps 1:00 PM / afternoon return issues from being skipped.
            int pmStartGap;
            if (TryParsePunchTime(afternoonIn, out var pmInTs))
            {
                pmStartGap = GapMinutes(pmStart, pmInTs);
                if (pmStartGap > 240) pmStartGap = 240;
            }
            else
            {
                pmStartGap = 240;                      // missing PM IN → full PM shortage
            }

            // Total undertime (max 480 per day)
            int total = utAM + Math.Min(240, pmStartGap + utPM);
            if (total > 480) total = 480;

            return total.ToString();
        }















































        // Event handlers
        private void cmddepartment_SelectedIndexChanged(object sender, EventArgs e)
        {

        }


        private void SAMELCOII_ITS_DTR_FORM_Load(object sender, EventArgs e)
        {
            Data.WarmUpCacheAsync();

            // Keep helper columns hidden in employee list.
            if (listemployee != null && listemployee.Columns.Count >= 3)
            {
                int fillWidth = Math.Max(120, listemployee.ClientSize.Width - 8);
                listemployee.Columns[0].Width = fillWidth; // Employee (full visible width)
                listemployee.Columns[1].Width = 0; // Department
                listemployee.Columns[2].Width = 0; // Account Number / bioUID
                listemployee.SizeChanged += (s, ev) =>
                {
                    if (listemployee.Columns.Count == 0) return;
                    listemployee.Columns[0].Width = Math.Max(120, listemployee.ClientSize.Width - 8);
                };
            }

            LoadAllDepartments();
            UpdateAreaCheckboxMode();
            _myUserId = Constring.UserCode;
            AutoCheckAreaByAreaText(GetEmployeeAreaByAnyId(_myUserId), true);

            InitDtrMyMonthMaterialCombo();   // fills combo + hooks CmbMonth_SelectedIndexChanged
            EnsurePreviewInMonthPanel(); // ensures the preview control exists

            // Force initial render for the current month
            cmbMonth_SelectedIndexChanged(cmbMonth, EventArgs.Empty);
            if (PIDnumber != null)
            {
                PIDnumber.Text = Constring.UserCode;
                _myUserIdForMonth = PIDnumber.Text;   // keep a local copy for headers
            }

            // 2) Choose a paper + margins (A4 portrait with tight margins as example)

            ApplyPaperAndMargins(_printDocMyMonth, PaperKind.A4, false, 0, 0, 0, 0);

            // If you prefer LEGAL landscape for the 3-per-page doc:
            // ApplyPaperAndMargins(printDocument3, PaperKind.Legal, true, 25,25,25,25);

            // 3) Scaling options
            _fitToPage = true;     // auto shrink to fit margins
            _printScale = 3.34f;   // and not larger than 95% (optional



            if (PIDnumber != null) PIDnumber.Text = Constring.UserCode;
            _myUserIdForMonth = PIDnumber != null ? PIDnumber.Text : Constring.UserCode;

            InitDtrMyMonthMaterialCombo();
            EnsurePreviewInMonthPanel();
            ApplyPaperAndMargins(_printDocMyMonth, PaperKind.Custom, false, 0, 0, 0, 0);
            LoadMyMonthlyComputedDTR();

            // ... your existing init ...
            _lens = new MagnifierLens();

            // hook panel events
            PLDTR_BY_MONTH.MouseMove += PLDTR_BY_MONTH_MouseMove;
            PLDTR_BY_MONTH.MouseEnter += (s, ev) => { PLDTR_BY_MONTH.Focus(); _lens.Show(); };
            PLDTR_BY_MONTH.MouseLeave += (s, ev) => _lens.Hide();
            // PLDTR_BY_MONTH.MouseWheel += PLDTR_BY_MONTH_MouseWheel; // zoom with wheel
            PLDTR_BY_MONTH.Cursor = Cursors.Cross;                   // “lens” vibe


            LoadYearsFromCheckinout();   // fills cndyear2
            LoadMonths();                // fills cmdmonth2

            // Wire events (avoid duplicates if Init can be called twice)
            cndyear2.SelectedIndexChanged -= YearOrMonthChanged;
            cmdmonth2.SelectedIndexChanged -= YearOrMonthChanged;
            cndyear2.SelectedIndexChanged += YearOrMonthChanged;
            cmdmonth2.SelectedIndexChanged += YearOrMonthChanged;

            // Set defaults (current month/year) then compute range
            if (cndyear2.Items.Count > 0 && cndyear2.SelectedIndex < 0)
                cndyear2.SelectedItem = DateTime.Now.Year.ToString();
            if (cmdmonth2.Items.Count > 0 && cmdmonth2.SelectedIndex < 0)
                cmdmonth2.SelectedItem = DateTime.Now.ToString("MMMM", CultureInfo.InvariantCulture);

            UpdateRangeFromYearMonth();
            TryWireManualSearchForDtr();
            TryWireListEmployeeQuickRemove();


            // Wire handlers (idempotent)
            printDocument3.BeginPrint -= printDocument3_BeginPrint;
            printDocument3.BeginPrint += printDocument3_BeginPrint;

            printDocument3.EndPrint -= printDocument3_EndPrint;
            printDocument3.EndPrint += printDocument3_EndPrint;

            printDocument3.PrintPage -= printDocument3_PrintPage;
            printDocument3.PrintPage += printDocument3_PrintPage;

            SetupDTRGrid();
            // Get the current year and month
            int currentYear = DateTime.Now.Year;
            int currentMonth = DateTime.Now.Month;

            // Set dateFrom to the 1st day of the current month
            datefrom.Value = new DateTime(currentYear, currentMonth, 1);

            // Set dateToNow to the last day of the current month
            int lastDayOfMonth = DateTime.DaysInMonth(currentYear, currentMonth);
            datetonow.Value = new DateTime(currentYear, currentMonth, lastDayOfMonth);
            // LoadAllDepartments();

        }
        // Set paper kind + orientation + margins (hundredths of inch)
        private void ApplyPaperAndMargins(
      PrintDocument doc,
      PaperKind _ignoredKind,   // kept for signature compatibility; not used
      bool landscape,
      int left = 0, int right = 0, int top = 0, int bottom = 0)
        {
            if (doc == null) return;

            // Always use a fixed custom size: 8.50" x 3.80" (units are 1/100 inch)
            const int WIDTH = 1000;  // 8.50 inches
            const int HEIGHT = 2150;  // 3.80 inches

            var custom = new PaperSize("Fixed800x280", WIDTH, HEIGHT); // Kind == Custom

            // Orientation
            doc.DefaultPageSettings.Landscape = landscape;

            // Apply to both the document’s defaults and the printer’s defaults (helps some drivers)
            doc.DefaultPageSettings.PaperSize = custom;
            try
            {
                if (doc.PrinterSettings != null &&
                    doc.PrinterSettings.DefaultPageSettings != null)
                {
                    doc.PrinterSettings.DefaultPageSettings.Landscape = landscape;
                    doc.PrinterSettings.DefaultPageSettings.PaperSize = custom;
                }
            }
            catch { /* swallow printer driver quirks safely */ }

            // Margins
            var m = new Margins(left, right, top, bottom);
            doc.DefaultPageSettings.Margins = m;

            try
            {
                if (doc.PrinterSettings != null &&
                    doc.PrinterSettings.DefaultPageSettings != null)
                {
                    doc.PrinterSettings.DefaultPageSettings.Margins = m;
                }
            }
            catch { /* safe no-op */ }
        }

        // Optional: request a custom paper size (hundredths of inch)

        private void ApplyCustomPaper(
           System.Drawing.Printing.PrintDocument doc,
           string name, int widthHi, int heightHi, bool landscape)
        {
            doc.DefaultPageSettings.Landscape = landscape;
            var custom = new System.Drawing.Printing.PaperSize(name, widthHi, heightHi)
            {
                RawKind = (int)System.Drawing.Printing.PaperKind.Custom
            };
            doc.DefaultPageSettings.PaperSize = custom;
        }
        // Begin scaled drawing inside the page margins
        private void BeginScaledDrawing(Graphics g, Rectangle marginBounds)
        {
            float sx = marginBounds.Width / _logicalContentSize.Width;
            float sy = marginBounds.Height / _logicalContentSize.Height;
            float fitScale = Math.Min(sx, sy);

            float scale = _fitToPage ? fitScale : 1.0f;
            if (_printScale >= 0.1f && _printScale <= 1.0f)
                scale = Math.Min(scale, _printScale);

            g.TranslateTransform(marginBounds.Left, marginBounds.Top);
            g.ScaleTransform(scale, scale);
        }

        // Reset transforms after scaled drawing
        private void EndScaledDrawing(System.Drawing.Graphics g)
        {
            g.ResetTransform();
        }


        // ONE canonical handler for the month combobox
        private void OnMonthChanged(object sender, EventArgs e)
        {
            try
            {
                // Guard: no user yet or no item selected
                _myUserId = Constring.UserCode;
                if (string.IsNullOrWhiteSpace(_myUserId)) return;
                if (cmbMonth == null || cmbMonth.SelectedItem == null) return;

                // Reuse your existing logic to load the selected month & refresh preview


                // If the preview control exists, re-render it
                _previewMonthCtl?.InvalidatePreview();
            }
            catch { /* swallow to avoid design-time crashes */ }
        }


        private void InitDtrMyMonthMaterialCombo()
        {
            if (cmbMonth == null) return;

            // Detach any old handlers (including wrong names) and attach the single handler
            cmbMonth.SelectedIndexChanged -= OnMonthChanged;

            if (cmbMonth.Items.Count == 0)
            {
                cmbMonth.Items.AddRange(new object[]
                {
            "January","February","March","April","May",
            "June","July","August","September","October",
            "November","December"
                });
            }

            int idx = DateTime.Now.Month - 1;

            // Some MaterialSkin builds expose StartIndex; try safely
            try { cmbMonth.GetType().GetProperty("StartIndex")?.SetValue(cmbMonth, idx, null); } catch { }
            cmbMonth.SelectedIndex = idx;

            // Attach the single handler
            cmbMonth.SelectedIndexChanged += OnMonthChanged;
        }

























        private string _myPosition = "";
        private int _myPrivilege = 0;



        private void PrintDocMyMonth_PrintPage(object sender, PrintPageEventArgs e)
        {
            Graphics g = e.Graphics;

            string printUserCode = (_myUserIdForMonth ?? "").Trim();
            if (string.IsNullOrWhiteSpace(printUserCode))
                printUserCode = (PIDnumber != null ? PIDnumber.Text : Constring.UserCode) ?? "";

            DataTable dt = BuildMonthlyDtrDataForUser(printUserCode, out string printBioUid, out string printPosition);
            if ((dt == null || dt.Rows.Count == 0) && dataGridView1?.DataSource is DataTable gridDt)
                dt = gridDt;

            // Guard
            if (dt == null || dt.Rows.Count == 0)
            {
                g.DrawString("No DTR data.", SystemFonts.MessageBoxFont, Brushes.Black, 50, 50);
                e.HasMorePages = false;
                return;
            }

            using (var f = new Font("Segoe UI", 8))
            using (var fb = new Font("Segoe UI", 8, FontStyle.Bold))
            using (var fi = new Font("Segoe UI", 7, FontStyle.Italic))
            {
                // begin scaled drawing in margin bounds
                Rectangle mb = e.MarginBounds;
                BeginScaledDrawing(g, mb);

                // HEADER (ID/Name/Month)
                string headerId = string.IsNullOrWhiteSpace(printUserCode) ? (Constring.UserCode ?? "") : printUserCode;
                string myName = "";
                try
                {
                    using (var con = new MySqlConnection(membershipCon.Constring2))
                    using (var cmd = new MySqlCommand(
                        "SELECT name FROM usertb WHERE bioUID=@id OR usercode=@id LIMIT 1;", con))
                    {
                        cmd.Parameters.AddWithValue("@id", headerId);
                        con.Open();
                        myName = Convert.ToString(cmd.ExecuteScalar()) ?? "";
                    }
                }
                catch { /* ignore */ }

                g.DrawString("ID:", f, Brushes.Black, new Point(110, 20));
                g.DrawString("Name:", f, Brushes.Black, new Point(90, 40));
                g.DrawString("Month:", f, Brushes.Black, new Point(90, 60));
                g.DrawString(headerId, fb, Brushes.Black, new Point(130, 20));
                g.DrawString(myName, fb, Brushes.Black, new Point(130, 40));

                // Month label from state (fallback to now)
                DateTime monthStart = (_monthStart == default(DateTime))
                    ? new DateTime(DateTime.Now.Year, DateTime.Now.Month, 1)
                    : _monthStart;

                // >>> FIX 1: define monthEnd here <<<
                DateTime monthEnd = (_monthEnd == default(DateTime))
                    ? monthStart.AddMonths(1).AddDays(-1)
                    : _monthEnd;

                string headerArea = ToDisplayAreaName(GetEmployeeAreaByAnyId(headerId));
                g.DrawString($"Month: {monthStart:MMMM}    |    Area: {headerArea}", f, Brushes.Black, new Point(130, 60));

                // Determine if Substation Tender for Shift labels
                bool isSubstation = false;
                string employeePosition = printPosition ?? "";
                try
                {
                    if (string.IsNullOrWhiteSpace(employeePosition))
                        employeePosition = GetEmployeePositionByUserId(headerId) ?? "";
                    isSubstation =
                        string.Equals(employeePosition, "Substation Tender", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(employeePosition, "Security Guard", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(employeePosition, "Maintenance", StringComparison.OrdinalIgnoreCase);
                }
                catch { /* ignore */ }

                // === Department head from PIDnumber.Text ===
                string pidCode = PIDnumber?.Text?.Trim() ?? string.Empty;
                string deptForPid = string.Empty;
                try
                {
                    using (var con = new MySqlConnection(membershipCon.Constring2))
                    using (var cmd = new MySqlCommand(
                        "SELECT COALESCE(department,'') FROM usertb WHERE usercode=@id OR bioUID=@id LIMIT 1;", con))
                    {
                        cmd.Parameters.AddWithValue("@id", pidCode);
                        con.Open();
                        deptForPid = Convert.ToString(cmd.ExecuteScalar()) ?? string.Empty;
                    }
                }
                catch { /* ignore */ }

                var (headName, headPos) = GetBossNameByDepartment(deptForPid, myName, employeePosition, headerArea);

                // Grid layout & static labels
                DrawRectangles(g, 0);
                DrawStaticLabels(g, f, fb, 0, isSubstation, myName, employeePosition, headName, headPos);

                // Build lookup by date (first row per date)
                var byDate = dt.AsEnumerable()
                               .GroupBy(r => r.Field<DateTime>("WorkDate").Date)
                               .ToDictionary(grp => grp.Key, grp => grp.First());

                // Pre-fetch special days (holidays / EPASS / leaves)
                // This returns labels with NO "Epass:" prefix and destination truncated to 8 words.
                var specialByDate = GetImportantDatesForRange_AnyId(monthStart, monthEnd, headerId);
                string employeeArea = GetEmployeeAreaByAnyId(headerId);




                // Column captions (your style)
                g.DrawString(isSubstation ? "Shift 1" : "A M", f, Brushes.Black, new Point(80, 94));
                g.DrawString(isSubstation ? "Shift 2" : "P M", f, Brushes.Black, new Point(171, 94));
                g.DrawString(isSubstation ? "Shift 3" : "Over time", f, Brushes.Black, new Point(250, 93));
                g.DrawString("IN", f, Brushes.Black, new Point(59, 116));
                g.DrawString("OUT", f, Brushes.Black, new Point(100, 116));
                g.DrawString("IN", f, Brushes.Black, new Point(153, 116));
                g.DrawString("OUT", f, Brushes.Black, new Point(193, 116));
                g.DrawString("IN", f, Brushes.Black, new Point(248, 116));
                g.DrawString("OUT", f, Brushes.Black, new Point(289, 116));
                g.DrawString("Under", f, Brushes.Black, new Point(325, 85));
                g.DrawString("Time", f, Brushes.Black, new Point(327, 97));
                g.DrawString("Day", f, Brushes.Black, new Point(20, 96));

                // Layout
                int y = 133;
                int h = 18;
                int totalUT = 0;

                // helper
                int SafeParseMinutes(object v)
                {
                    var s = Convert.ToString(v) ?? "";
                    var digits = new string(s.Where(char.IsDigit).ToArray());
                    return int.TryParse(digits, out var m) ? m : 0;
                }

                // Loop days of month
                int days = DateTime.DaysInMonth(monthStart.Year, monthStart.Month);
                for (int d = 1; d <= days; d++)
                {
                    var day = new DateTime(monthStart.Year, monthStart.Month, d);
                    byDate.TryGetValue(day.Date, out DataRow r);

                    string amIn = r?["Morning_IN"]?.ToString() ?? "";
                    string amOut = r?["Morning_OUT"]?.ToString() ?? "";
                    string pmIn = r?["Afternoon_IN"]?.ToString() ?? "";
                    string pmOut = r?["Afternoon_OUT"]?.ToString() ?? "";
                    string otIn = r?["OT_IN"]?.ToString() ?? "";
                    string otOut = r?["OT_OUT"]?.ToString() ?? "";
                    string amInArea = r?["Morning_IN_Area"]?.ToString() ?? "";
                    string amOutArea = r?["Morning_OUT_Area"]?.ToString() ?? "";
                    string pmInArea = r?["Afternoon_IN_Area"]?.ToString() ?? "";
                    string pmOutArea = r?["Afternoon_OUT_Area"]?.ToString() ?? "";
                    string otInArea = r?["OT_IN_Area"]?.ToString() ?? "";
                    string otOutArea = r?["OT_OUT_Area"]?.ToString() ?? "";

                    bool hasRegularPunch = new[] { amIn, amOut, pmIn, pmOut }
                                        .Any(s => TryParsePunchTime(s, out _));
                    bool hasOtPunch = new[] { otIn, otOut }
                                    .Any(s => TryParsePunchTime(s, out _));
                    bool anyPunch = hasRegularPunch || hasOtPunch;

                    bool isWeekendDay = (day.DayOfWeek == DayOfWeek.Saturday) || (day.DayOfWeek == DayOfWeek.Sunday);
                    bool hasSpecial = specialByDate.ContainsKey(day.Date);
                    string specialLabel = hasSpecial ? specialByDate[day.Date] : string.Empty;
                    string dayAreaHint = DetectAreaFromText(specialLabel);
                    bool isHolidaySpecial = hasSpecial &&
                        specialLabel.ToUpper().Contains("H      O      L      I      D      A      Y");

                    bool hasMiddlePunchForSpecial = TryParsePunchTime(amOut, out _) || TryParsePunchTime(pmIn, out _);
                    if (hasSpecial && !isHolidaySpecial && !hasMiddlePunchForSpecial)
                    {
                        if (IsNoonBoundaryPunch(amOut)) amOut = "";
                        if (IsNoonBoundaryPunch(pmIn)) pmIn = "";
                    }


                    // --- Undertime rule ---
                    int utForDay = 0;
                    if (!isWeekendDay && !hasSpecial)
                    {
                        if (r != null)
                        {
                            if (r.Table.Columns.Contains("Undertime_Min"))
                                utForDay = Math.Min(480, SafeParseMinutes(r["Undertime_Min"]));
                            else
                                utForDay = Math.Min(480, SafeParseMinutes(r["LateCount"]));
                        }
                        else
                        {
                            utForDay = 480;
                        }
                    }
                    if (hasOtPunch && !hasRegularPunch)
                        utForDay = 0; // overtime-only rows do not add undertime

                    if (IsSecurityGuardPosition(employeePosition))
                    {
                        MoveRenderedOvernightPairToShift3(
                            ref amIn, ref amOut,
                            ref pmIn, ref pmOut,
                            ref otIn, ref otOut,
                            ref amInArea, ref amOutArea,
                            ref pmInArea, ref pmOutArea,
                            ref otInArea, ref otOutArea,
                            ref utForDay);

                        MoveRenderedGuardFallbackToShift3(
                            ref amIn, ref amOut,
                            ref otIn, ref otOut,
                            ref amInArea, ref amOutArea,
                            ref otInArea, ref otOutArea,
                            ref utForDay);
                    }

                    totalUT += utForDay;

                    // Day number
                    g.DrawString(d.ToString(), fb, Brushes.Black, new Point(27, y));

                    if (!anyPunch && (isWeekendDay || hasSpecial))
                    {
                        // Label only (no times, no UT)
                        string displayText;
                        Brush textBrush;

                        if (hasSpecial)
                        {
                            displayText = specialLabel;
                            textBrush = specialLabel.ToUpper().Contains("H      O      L      I      D      A      Y")
                                        ? Brushes.Orange : Brushes.Blue;
                        }
                        else
                        {
                            displayText = (day.DayOfWeek == DayOfWeek.Saturday)
                                          ? "S    A    T    U    R    D    A    Y"
                                          : "S      U      N      D      A      Y";
                            textBrush = Brushes.Red;
                        }

                        g.DrawString(displayText, fb, textBrush, new Point(94, y));
                    }
                    else
                    {
                        // Normal row
                        DrawTimeWithAreaMarker(g, fb, amIn, 53, y, employeeArea, string.IsNullOrWhiteSpace(amInArea) ? dayAreaHint : amInArea);
                        DrawTimeWithAreaMarker(g, fb, amOut, 98, y, employeeArea, string.IsNullOrWhiteSpace(amOutArea) ? dayAreaHint : amOutArea);
                        DrawTimeWithAreaMarker(g, fb, pmIn, 144, y, employeeArea, string.IsNullOrWhiteSpace(pmInArea) ? dayAreaHint : pmInArea);
                        DrawTimeWithAreaMarker(g, fb, pmOut, 189, y, employeeArea, string.IsNullOrWhiteSpace(pmOutArea) ? dayAreaHint : pmOutArea);
                        DrawTimeWithAreaMarker(g, fb, otIn, 238, y, employeeArea, string.IsNullOrWhiteSpace(otInArea) ? dayAreaHint : otInArea);
                        DrawTimeWithAreaMarker(g, fb, otOut, 289, y, employeeArea, string.IsNullOrWhiteSpace(otOutArea) ? dayAreaHint : otOutArea);

                        // For EPASS/LEAVE/TO rows with punches:
                        // show the special tag in the middle while noon OUT/IN stays hidden.
                        if (hasSpecial && !isHolidaySpecial && !hasMiddlePunchForSpecial)
                            g.DrawString(CompactSpecialLabel(specialLabel), fb, Brushes.Blue, new Point(104, y));

                        // UT column (blank when zero)
                        g.DrawString(utForDay > 0 ? utForDay.ToString() : "", fb, Brushes.Black, new Point(331, y));
                    }

                    y += h;
                }

                // Total (right-aligned to "Total:_____")
                var valueRect = new RectangleF(100, 690, 220, 20);
                using (var sf = new StringFormat { Alignment = StringAlignment.Far, LineAlignment = StringAlignment.Center })
                    g.DrawString($"{totalUT:N0}", fb, Brushes.Black, valueRect, sf);
                DrawAreaLegend(g, f, 10, 800);

                // Signatory by privilege (1–5 Personal, 7–10 HR/HEAD)
                int priv = 0;
                try
                {
                    using (var con = new MySqlConnection(membershipCon.Constring2))
                    using (var cmd = new MySqlCommand(
                        "SELECT COALESCE(privilage,0) FROM usertb WHERE bioUID=@id OR usercode=@id LIMIT 1;", con))
                    {
                        cmd.Parameters.AddWithValue("@id", headerId);
                        con.Open();
                        object o = cmd.ExecuteScalar();
                        if (o != null) priv = Convert.ToInt32(o);
                    }
                }
                catch { /* ignore */ }

                if (priv >= 1 && priv <= 5)
                    g.DrawString("Personal", fb, Brushes.Black, new Point(961, 756));
                else if (priv >= 7 && priv <= 10)
                    g.DrawString("HR/HEAD", fb, Brushes.Black, new Point(10, 756));

                // end scaled drawing
                EndScaledDrawing(g);
            }

            e.HasMorePages = false;
        }



        // YEAR-WIDE special days map (Holiday > EPASS > Leave), no "Epass:" prefix, EPASS trimmed to 8 words.
        // Range-based (uses your datefrom/datetonow), with EPASS = single 'date' only
        private Dictionary<DateTime, string> GetImportantDatesForRange_Simple(
            DateTime fromDate, DateTime toDate, string empOrUserCode)
        {
            fromDate = fromDate.Date;
            toDate = toDate.Date;

            var special = new Dictionary<DateTime, string>(); // date-only keys

            string TruncateWords(string s, int maxWords = 8)
            {
                if (string.IsNullOrWhiteSpace(s)) return "";
                var parts = s.Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                var full = string.Join(" ", parts);
                var byWords = parts.Length <= maxWords ? full : string.Join(" ", parts.Take(maxWords));
                const int maxChars = 36;
                string final = byWords.Length > maxChars ? byWords.Substring(0, maxChars).TrimEnd() : byWords;
                return string.Equals(final, full, StringComparison.Ordinal) ? final : (final + "...");
            }

            string LeaveShortOrTrim(string raw)
            {
                if (string.IsNullOrWhiteSpace(raw)) return "LV";
                var up = raw.Trim().ToUpperInvariant();

                if (raw.Contains("SICK")) return "Sick Leave";
                if (raw.Contains("VAC")) return "Vecation Leave";
                if (raw.Contains("EMER")) return "Emergency Leave";
                if (raw.Contains("OFFICIAL")) return "OB";
                if (raw.Contains("SPECIAL")) return "SPL";
                if (raw.Contains("BIRTH")) return "Birth Day";
                if (raw.Contains("MEDICAL")) return "ML";
                if (raw.Contains("PATERNITY")) return "PL";
                if (raw.Contains("UNION")) return "UL";
                if (raw.Contains("FIESTA")) return "FL";
                if (up.Contains("LWOP") || up.Contains("WITHOUT")) return "LWOP";

                // Unmapped/long description → trim to 8 words (no extra prefix)
                return TruncateWords(raw, 8);
            }

            string SpacedHoliday(string word) =>
                string.IsNullOrWhiteSpace(word) ? word : string.Join("      ", word.Trim().ToUpper().ToCharArray());

            using (var conn = new MySqlConnection(membershipCon.Constring2))
            {
                conn.Open();

                // 1) Holidays (top priority)
                using (var cmd = new MySqlCommand(@"
            SELECT holiday_date AS d
            FROM philippine_holidays
            WHERE holiday_date BETWEEN @d1 AND @d2;", conn))
                {
                    cmd.Parameters.AddWithValue("@d1", fromDate);
                    cmd.Parameters.AddWithValue("@d2", toDate);
                    using (var rd = cmd.ExecuteReader())
                        while (rd.Read())
                        {
                            var d = Convert.ToDateTime(rd["d"]).Date;
                            if (!special.ContainsKey(d)) special[d] = SpacedHoliday("HOLIDAY");
                        }
                }

                // 2) EPASS (single-date only; no prefix; trim to 8 words). DO NOT overwrite holiday.
                using (var cmd = new MySqlCommand(@"
            SELECT DATE(`date`) AS d, destination
            FROM epasstb
            WHERE DATE(`date`) BETWEEN @d1 AND @d2
              AND (
                    usercode = @key
                 OR usercode = (SELECT usercode FROM usertb WHERE bioUID=@key  LIMIT 1)
                 OR usercode = (SELECT usercode FROM usertb WHERE usercode=@key LIMIT 1)
                 OR usercode = (SELECT bioUID FROM usertb WHERE usercode=@key LIMIT 1)
              );", conn))
                {
                    cmd.Parameters.AddWithValue("@d1", fromDate);
                    cmd.Parameters.AddWithValue("@d2", toDate);
                    cmd.Parameters.AddWithValue("@key", empOrUserCode ?? "");
                    using (var rd = cmd.ExecuteReader())
                        while (rd.Read())
                        {
                            var d = Convert.ToDateTime(rd["d"]).Date;
                            if (special.ContainsKey(d)) continue; // keep holiday
                            var label = TruncateWords(Convert.ToString(rd["destination"]) ?? "", 8);
                            special[d] = string.IsNullOrWhiteSpace(label) ? "EPASS" : label; // no "Epass:" text
                        }
                }

                // 3) LEAVES (datafrom–dateto). DO NOT overwrite holiday/epass.
                using (var cmd = new MySqlCommand(@"
            SELECT datafrom, dateto, leave_record
            FROM tbleave
            WHERE (empId = @key
                   OR empId = (SELECT usercode FROM usertb WHERE bioUID=@key  LIMIT 1)
                   OR empId = (SELECT bioUID   FROM usertb WHERE usercode=@key LIMIT 1))
              AND dateto   >= @d1
              AND datafrom <= @d2;", conn))
                {
                    cmd.Parameters.AddWithValue("@key", empOrUserCode ?? "");
                    cmd.Parameters.AddWithValue("@d1", fromDate);
                    cmd.Parameters.AddWithValue("@d2", toDate);

                    using (var rd = cmd.ExecuteReader())
                        while (rd.Read())
                        {
                            var df = Convert.ToDateTime(rd["datafrom"]).Date;
                            var dt = Convert.ToDateTime(rd["dateto"]).Date;
                            if (df < fromDate) df = fromDate;
                            if (dt > toDate) dt = toDate;

                            var codeOrTrim = LeaveShortOrTrim(Convert.ToString(rd["leave_record"]) ?? "");

                            for (var d = df; d <= dt; d = d.AddDays(1))
                                if (!special.ContainsKey(d))
                                    special[d] = codeOrTrim;
                        }
                }
            }

            return special;
        }



        // small helper: draws corner crop marks in the *content* coordinate space (after scale)
        private void DrawCropMarks(Graphics g, float w, float h)
        {
            var p = new Pen(Color.DarkGray, 0.5f);
            float L = 10f;
            // top-left
            g.DrawLine(p, 0, 0, L, 0);
            g.DrawLine(p, 0, 0, 0, L);
            // top-right
            g.DrawLine(p, w - L, 0, w, 0);
            g.DrawLine(p, w, 0, w, L);
            // bottom-left
            g.DrawLine(p, 0, h - L, 0, h);
            g.DrawLine(p, 0, h, L, h);
            // bottom-right
            g.DrawLine(p, w - L, h, w, h);
            g.DrawLine(p, w, h - L, w, h);
        }













































































        private void loaddata_MouseClick(object sender, MouseEventArgs e)
        {

            SAMELCOII_ITS_UPLOADDTR_FORM mainForm = new SAMELCOII_ITS_UPLOADDTR_FORM();
            mainForm.ShowDialog();
        }


        private PrintDocument printDoc = new PrintDocument();
        private PrintDocument printDocument1 = new PrintDocument();
        private PrintDialog printDialog1 = new PrintDialog();
        private PrintPreviewDialog printPreviewDialog1 = new PrintPreviewDialog();

        int CountItem = 0;
        int CountItem1 = 0;

        int xx;
        int yy1;


        private void plprint_Paint(object sender, PaintEventArgs e)
        {

        }



        // for PRINTING





        int startY = 0; // Starting Y position for day entries
        int dayHeight = 0; // Spacing between rows

        private void printDocument2_PrintPage(object sender, PrintPageEventArgs e)
        {

        }

        public Dictionary<DateTime, string> GetImportantDates(DateTime yearAnchor, string userCode)
        {
            // Always store as DATE-ONLY keys
            var special = new Dictionary<DateTime, string>();

            int year = yearAnchor.Year;

            // Helper: turn raw leave text into a short label
            string LeaveShort(string raw)
            {
                if (string.IsNullOrWhiteSpace(raw)) return "LV";
                raw = raw.Trim().ToUpperInvariant();

                if (raw.Contains("SICK")) return "Sick Leave";
                if (raw.Contains("VAC")) return "Vecation Leave";
                if (raw.Contains("EMER")) return "Emergency Leave";
                if (raw.Contains("OFFICIAL")) return "OB";
                if (raw.Contains("SPECIAL")) return "SPL";
                if (raw.Contains("BIRTH")) return "Birth Day";
                if (raw.Contains("MEDICAL")) return "ML";
                if (raw.Contains("PATERNITY")) return "PL";
                if (raw.Contains("UNION")) return "UL";
                if (raw.Contains("FIESTA")) return "FL";
                if (raw.Contains("LWOP") || raw.Contains("WITHOUT")) return "LWOP";

                // default: first 2 letters
                return new string(raw.Take(2).ToArray());
            }

            // Optional: make a spaced-out label like your HOLIDAY style
            string Spaced(string s)
            {
                if (string.IsNullOrWhiteSpace(s)) return s;
                // put extra spaces between letters so your print shows large spaced text
                return string.Join("      ", s.ToUpper().ToCharArray());
            }

            using (var conn = new MySqlConnection(membershipCon.Constring2))
            {
                conn.Open();

                // 1) Holidays (highest priority)
                using (var cmd = new MySqlCommand(@"
            SELECT holiday_date AS d
            FROM philippine_holidays
            WHERE YEAR(holiday_date) = @yr;", conn))
                {
                    cmd.Parameters.AddWithValue("@yr", year);
                    using (var rd = cmd.ExecuteReader())
                    {
                        while (rd.Read())
                        {
                            var d = Convert.ToDateTime(rd["d"]).Date;
                            if (!special.ContainsKey(d))
                                special[d] = Spaced("HOLIDAY");  // your signature spacing
                        }
                    }
                }

                // 2) EPASS for this user (2nd priority; don’t overwrite holidays)
                using (var cmd = new MySqlCommand(@"
            SELECT `date` AS d, destination
            FROM epasstb
            WHERE YEAR(`date`) = @yr
              AND usercode = @uc;", conn))
                {
                    cmd.Parameters.AddWithValue("@yr", year);
                    cmd.Parameters.AddWithValue("@uc", userCode ?? "");
                    using (var rd = cmd.ExecuteReader())
                    {
                        while (rd.Read())
                        {
                            var d = Convert.ToDateTime(rd["d"]).Date;
                            if (!special.ContainsKey(d))
                            {
                                var dest = Convert.ToString(rd["destination"]) ?? "";
                                var shortDest = TruncateWords(dest, 6, 36);
                                special[d] = string.IsNullOrWhiteSpace(shortDest) ? "EPASS" : $"EPASS: {shortDest}";
                            }
                        }
                    }
                }

                // 3) Leaves / OB, etc. from tbleave (3rd priority; don’t overwrite Holiday/EPASS)
                // Your table uses empId (usercode/Id number). We pull any record overlapping this year.
                using (var cmd = new MySqlCommand(@"
            SELECT datafrom, dateto, leave_record
            FROM tbleave
            WHERE empId = @emp
              AND datafrom <= @yearEnd
              AND dateto   >= @yearStart;", conn))
                {
                    var yearStart = new DateTime(year, 1, 1);
                    var yearEnd = new DateTime(year, 12, 31);

                    cmd.Parameters.AddWithValue("@emp", userCode ?? "");
                    cmd.Parameters.AddWithValue("@yearStart", yearStart);
                    cmd.Parameters.AddWithValue("@yearEnd", yearEnd);

                    using (var rd = cmd.ExecuteReader())
                    {
                        while (rd.Read())
                        {
                            var df = Convert.ToDateTime(rd["datafrom"]).Date;
                            var dt = Convert.ToDateTime(rd["dateto"]).Date;
                            var code = LeaveShort(Convert.ToString(rd["leave_record"]) ?? "");

                            // clip to current year
                            if (df < yearStart) df = yearStart;
                            if (dt > yearEnd) dt = yearEnd;

                            for (var d = df; d <= dt; d = d.AddDays(1))
                            {
                                if (!special.ContainsKey(d))
                                    special[d] = code; // e.g., VL / SL / OB / etc.
                            }
                        }
                    }
                }

                // 4) (Optional) Add other special sources here later if needed, keeping the same
                //    priority approach: only write if the date key isn’t already present.
            }

            return special;
        }




        // Helper Method: Draw Layout Rectangles
        private void DrawRectangles(Graphics g, int xx)
        {
            g.DrawRectangle(Pens.Black, 19 + xx, 83, 341, 605); // Main bounding box

            g.DrawRectangle(Pens.Black, 89 + xx, 117, 234, 571);
            g.DrawRectangle(Pens.Black, 89 + xx, 117, 188, 571);

            //g.DrawRectangle(Pens.Black, 45 + xx, 83, 340, 605); // overtime line
            g.DrawRectangle(Pens.Black, 45 + xx, 83, 278, 605); // overtime line

            g.DrawRectangle(Pens.Black, 45 + xx, 83, 315, 605); // Inner box


            g.DrawRectangle(Pens.Black, 137 + xx, 83, 223, 605); // Sub-section


            g.DrawRectangle(Pens.Black, 229 + xx, 83, 131, 605); // Right section


            g.DrawRectangle(Pens.Black, 229 + xx, 83, 94, 605); // Right section



            g.DrawRectangle(Pens.Black, 181 + xx, 117, 179, 571); // Lower right box
                                                                  // Lower middle box


            g.DrawRectangle(Pens.Black, 19 + xx, 117, 341, 571);

            // Draw horizontal rows
            int baseY = 97 + 33;
            int rectangleHeight = 18;
            for (int i = 0; i < 31; i++)
            {
                int currentY = baseY + (i * rectangleHeight);
                g.DrawRectangle(Pens.Black, 19 + xx, currentY, 341, rectangleHeight);
            }
        }

        // Helper Method: Draw Static Labels
        private void DrawCenteredAutoFitText(
            Graphics g,
            string text,
            Font baseFont,
            Brush brush,
            RectangleF rect,
            bool bold = false,
            float minSize = 6.0f,
            StringAlignment align = StringAlignment.Center,
            float? maxSize = null)
        {
            if (string.IsNullOrWhiteSpace(text)) return;

            string t = text.Trim().ToUpperInvariant();
            float size = maxSize.HasValue ? Math.Min(baseFont.Size, maxSize.Value) : baseFont.Size;
            FontStyle style = bold ? (baseFont.Style | FontStyle.Bold) : baseFont.Style;

            using (var sf = new StringFormat
            {
                Alignment = align,
                LineAlignment = StringAlignment.Near,
                Trimming = StringTrimming.None,
                FormatFlags = StringFormatFlags.NoWrap
            })
            {
                while (size > minSize)
                {
                    using (var f = new Font(baseFont.FontFamily, size, style))
                    {
                        var m = g.MeasureString(t, f, new SizeF(rect.Width, rect.Height), sf);
                        if (m.Width <= rect.Width + 1 && m.Height <= rect.Height + 1)
                        {
                            g.DrawString(t, f, brush, rect, sf);
                            return;
                        }
                    }
                    size -= 0.5f;
                }

                using (var fMin = new Font(baseFont.FontFamily, minSize, style))
                {
                    g.DrawString(t, fMin, brush, rect, sf);
                }
            }
        }

        private void DrawStaticLabels(
     Graphics g,
     Font myFont,
     Font myFontBold,
     int xx,
     bool isSubstation,
     string employeeName,
     string employeePosition,
     string approverName,        // NEW
     string approverPosition     // NEW
 )
        {
            g.DrawString("ID:", myFont, Brushes.Black, new Point(110 + xx, 20));
            g.DrawString("Name:", myFont, Brushes.Black, new Point(90 + xx, 40));
            g.DrawString("Month:", myFont, Brushes.Black, new Point(90 + xx, 60));

            // column mini-headers
            g.DrawString("IN", myFont, Brushes.Black, new Point(59 + xx, 116));
            g.DrawString("OUT", myFont, Brushes.Black, new Point(100 + xx, 116));
            g.DrawString("IN", myFont, Brushes.Black, new Point(153 + xx, 116));
            g.DrawString("OUT", myFont, Brushes.Black, new Point(193 + xx, 116));
            g.DrawString("IN", myFont, Brushes.Black, new Point(248 + xx, 116));
            g.DrawString("OUT", myFont, Brushes.Black, new Point(289 + xx, 116));

            if (isSubstation)
            {
                g.DrawString("Shift 1", myFont, Brushes.Black, new Point(80 + xx, 94));
                g.DrawString("Shift 2", myFont, Brushes.Black, new Point(171 + xx, 94));
                g.DrawString("Shift 3", myFont, Brushes.Black, new Point(240 + xx, 93));
            }
            else
            {
                g.DrawString("A M", myFont, Brushes.Black, new Point(80 + xx, 94));
                g.DrawString("P M", myFont, Brushes.Black, new Point(171 + xx, 94));
                g.DrawString("Over time", myFont, Brushes.Black, new Point(250 + xx, 93));
            }

            g.DrawString("Under", myFont, Brushes.Black, new Point(325 + xx, 85));
            g.DrawString("Time", myFont, Brushes.Black, new Point(327 + xx, 97));
            g.DrawString("Day", myFont, Brushes.Black, new Point(20 + xx, 96));

            // "Total" label
         g.DrawString("Total:__________________", myFont, Brushes.Black, new Point(248 + xx, 698));

            // Signature block: Employee (left) + Department Head (right)
            bool hasEmployee = !string.IsNullOrWhiteSpace(employeeName);
            bool hasApprover = !string.IsNullOrWhiteSpace(approverName) || !string.IsNullOrWhiteSpace(approverPosition);
            if (hasEmployee || hasApprover)
            {
                using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Near })
                {
                    if (hasEmployee && hasApprover)
                    {
                        int leftLineX = 40 + xx;
                        int rightLineX = 210 + xx;
                        int lineW = 130;

                        var empNameRect = new RectangleF(leftLineX, 718, lineW, 14);
                        var empRoleRect = new RectangleF(leftLineX, 733, lineW, 14);
                        var headNameRect = new RectangleF(rightLineX, 764, lineW, 14);
                        var headRoleRect = new RectangleF(rightLineX, 779, lineW, 14);

                        int employeeLineY = (int)((empNameRect.Y + empNameRect.Height + empRoleRect.Y) / 2f);
                        // Keep boss line clearly below boss name to avoid overlap/cut effect.
                        int bossLineY = (int)(headNameRect.Y + headNameRect.Height + 4);
                        // Employee block uses wider area too, so long names/positions remain readable.
                        int empX = leftLineX - 18;
                        int empW = lineW + 42;
                        g.DrawLine(Pens.Black, empX, employeeLineY, empX + empW, employeeLineY);
                        // Boss block uses a wider unified area so name/title/line align even for long text.
                        int bossX = rightLineX - 28;
                        int bossW = lineW + 52;
                        g.DrawLine(Pens.Black, bossX, bossLineY, bossX + bossW, bossLineY);

                        // Employee text auto-fits.
                        var empNameRectFit = new RectangleF(empX, empNameRect.Y, empW, empNameRect.Height);
                        var empRoleRectFit = new RectangleF(empX, empRoleRect.Y + 2, empW, empRoleRect.Height);
                        DrawCenteredAutoFitText(g, employeeName, myFontBold, Brushes.Black, empNameRectFit, bold: true, minSize: 3.2f, align: StringAlignment.Center, maxSize: 6.8f);
                        DrawCenteredAutoFitText(g, string.IsNullOrWhiteSpace(employeePosition) ? "EMPLOYEE" : employeePosition, myFont, Brushes.Black, empRoleRectFit, minSize: 3.8f, align: StringAlignment.Center, maxSize: 6.4f);

                        // Boss text auto-fits.
                        var headNameRectFit = new RectangleF(bossX, headNameRect.Y, bossW, headNameRect.Height);
                        var headRoleRectFit = new RectangleF(bossX, headRoleRect.Y + 3, bossW, headRoleRect.Height);
                        DrawCenteredAutoFitText(g, approverName, myFontBold, Brushes.Black, headNameRectFit, bold: true, minSize: 4.2f, align: StringAlignment.Center, maxSize: 6.8f);
                        DrawCenteredAutoFitText(g, approverPosition, myFont, Brushes.Black, headRoleRectFit, minSize: 4.4f, align: StringAlignment.Center, maxSize: 6.4f);
                    }
                    else if (hasEmployee)
                    {
                        int lineX = 40 + xx;
                        int lineY = 764;
                        int lineW = 300;
                        g.DrawLine(Pens.Black, lineX, lineY, lineX + lineW, lineY);
                        var empNameRect = new RectangleF(lineX, 746, lineW, 14);
                        var empRoleRect = new RectangleF(lineX, 768, lineW, 14);
                        DrawCenteredAutoFitText(g, employeeName, myFontBold, Brushes.Black, empNameRect, bold: true, minSize: 3.2f, align: StringAlignment.Center, maxSize: 6.8f);
                        DrawCenteredAutoFitText(g, string.IsNullOrWhiteSpace(employeePosition) ? "EMPLOYEE" : employeePosition, myFont, Brushes.Black, empRoleRect, minSize: 3.8f, align: StringAlignment.Center, maxSize: 6.4f);
                    }
                    else
                    {
                        int lineX = 40 + xx;
                        int lineY = 764;
                        int lineW = 300;
                        g.DrawLine(Pens.Black, lineX, lineY, lineX + lineW, lineY);
                        var headNameRect = new RectangleF(lineX, 746, lineW, 14);
                        var headRoleRect = new RectangleF(lineX, 768, lineW, 14);
                        DrawCenteredAutoFitText(g, approverName, myFontBold, Brushes.Black, headNameRect, bold: true, minSize: 4.2f, align: StringAlignment.Center, maxSize: 6.8f);
                        DrawCenteredAutoFitText(g, approverPosition, myFont, Brushes.Black, headRoleRect, minSize: 4.4f, align: StringAlignment.Center, maxSize: 6.4f);
                    }
                }
            }

            if (this.pictureBox1?.BackgroundImage != null)
                g.DrawImage(this.pictureBox1.BackgroundImage, 34 + xx, 20, 50, 60);
        }

        private (string headName, string headPosition) GetDeptHeadByPidUsercode(string pidUsercodeOrBioUid)
        {
            if (string.IsNullOrWhiteSpace(pidUsercodeOrBioUid))
                return (string.Empty, string.Empty);

            try
            {
                using (var con = new MySqlConnection(membershipCon.Constring2))
                {
                    con.Open();

                    // 1) Which department is this PID user in?
                    string dept = "";
                    using (var cmdDept = new MySqlCommand(
                        @"SELECT COALESCE(department,'')
                  FROM usertb
                  WHERE usercode = @id OR bioUID = @id
                  LIMIT 1;", con))
                    {
                        cmdDept.Parameters.AddWithValue("@id", pidUsercodeOrBioUid);
                        var o = cmdDept.ExecuteScalar();
                        dept = o?.ToString()?.Trim() ?? "";
                    }
                    if (string.IsNullOrWhiteSpace(dept)) return (string.Empty, string.Empty);

                    // 2) Try to find a head in that department (tweak to your schema)
                    using (var cmdHead = new MySqlCommand(
                        @"SELECT name, position
                  FROM usertb
                  WHERE department = @dept
                    AND (
                          COALESCE(is_head,0) = 1
                       OR position LIKE '%Department Head%'
                       OR position LIKE '%Dept. Head%'
                       OR position LIKE '%Manager%'
                       OR position LIKE '%Head%'
                    )
                  ORDER BY COALESCE(is_head,0) DESC, position ASC
                  LIMIT 1;", con))
                    {
                        cmdHead.Parameters.AddWithValue("@dept", dept);
                        using (var rdr = cmdHead.ExecuteReader())
                        {
                            if (rdr.Read())
                            {
                                string name = rdr["name"]?.ToString()?.Trim() ?? "";
                                string pos = rdr["position"]?.ToString()?.Trim() ?? "";
                                if (!string.IsNullOrWhiteSpace(name))
                                    return (name, string.IsNullOrWhiteSpace(pos) ? "Department Head" : pos);
                            }
                        }
                    }

                    // 3) Fallback: any person in dept, prefer something with “Head/Manager”
                    using (var cmdFallback = new MySqlCommand(
                        @"SELECT name, position
                  FROM usertb
                  WHERE department = @dept
                  ORDER BY 
                    (position LIKE '%Head%') DESC,
                    (position LIKE '%Manager%') DESC,
                    position ASC
                  LIMIT 1;", con))
                    {
                        cmdFallback.Parameters.AddWithValue("@dept", dept);
                        using (var rdr = cmdFallback.ExecuteReader())
                        {
                            if (rdr.Read())
                            {
                                string name = rdr["name"]?.ToString()?.Trim() ?? "";
                                string pos = rdr["position"]?.ToString()?.Trim() ?? "";
                                if (!string.IsNullOrWhiteSpace(name))
                                    return (name, string.IsNullOrWhiteSpace(pos) ? "Department Head" : pos);
                            }
                        }
                    }
                }
            }
            catch { /* swallow & fall through */ }

            return (string.Empty, string.Empty);
        }

        // Resolve any identifier (bioUID or usercode) into both forms
        private (string bioUID, string usercode) ResolveIds(string anyId)
        {
            string bio = "", uc = "";
            try
            {
                using (var con = new MySqlConnection(membershipCon.Constring2))
                using (var cmd = new MySqlCommand(
                    "SELECT COALESCE(bioUID,'') AS bio, COALESCE(usercode,'') AS uc " +
                    "FROM usertb WHERE bioUID=@id OR usercode=@id LIMIT 1;", con))
                {
                    cmd.Parameters.AddWithValue("@id", anyId ?? "");
                    con.Open();
                    using (var rd = cmd.ExecuteReader())
                    {
                        if (rd.Read())
                        {
                            bio = Convert.ToString(rd["bio"]) ?? "";
                            uc = Convert.ToString(rd["uc"]) ?? "";
                        }
                    }
                }
            }
            catch { /* ignore */ }
            return (bio, uc);
        }

        private static string TruncateWords(string s, int maxWords = 6, int maxChars = 36)
        {
            if (string.IsNullOrWhiteSpace(s)) return "";
            var parts = s.Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            var full = string.Join(" ", parts);
            var byWords = parts.Length <= maxWords ? full : string.Join(" ", parts.Take(maxWords));

            string final = byWords;
            if (final.Length > maxChars)
                final = final.Substring(0, maxChars).TrimEnd();

            bool wasTrimmed = !string.Equals(final, full, StringComparison.Ordinal);
            return wasTrimmed ? (final + "...") : final;
        }





        private static string[] CanonicalNameTokens(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return Array.Empty<string>();

            var ignore = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "ENGR", "ENGINEER", "DR", "DRA", "MR", "MRS", "MS", "MISS",
                "ATTY", "ATTORNEY", "CPA", "REE", "RME", "JR", "SR", "II", "III", "IV"
            };

            var cleaned = new string(value.ToUpperInvariant()
                .Select(ch => char.IsLetterOrDigit(ch) ? ch : ' ')
                .ToArray());

            return cleaned
                .Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries)
                .Where(t => !ignore.Contains(t))
                .ToArray();
        }

        private static bool IsSamePersonName(string a, string b)
        {
            var ta = CanonicalNameTokens(a);
            var tb = CanonicalNameTokens(b);
            if (ta.Length == 0 || tb.Length == 0) return false;

            string na = string.Join("", ta);
            string nb = string.Join("", tb);
            if (na == nb) return true;
            if (na.Contains(nb) || nb.Contains(na)) return true;

            // Fallback: same last token + at least one same preceding token.
            string la = ta[ta.Length - 1];
            string lb = tb[tb.Length - 1];
            if (!string.Equals(la, lb, StringComparison.OrdinalIgnoreCase)) return false;

            var pa = new HashSet<string>(ta.Take(Math.Max(0, ta.Length - 1)), StringComparer.OrdinalIgnoreCase);
            return tb.Take(Math.Max(0, tb.Length - 1)).Any(t => pa.Contains(t));
        }

        private (string bossName, string position) GetOgmApprover(MySqlConnection con)
        {
            using (var cmdOgm = new MySqlCommand(@"
SELECT HeadsorOic, COALESCE(NULLIF(positions,''), NAME) AS HeadPos
FROM departmenttb
WHERE ABREVATION = 'OGM'
LIMIT 1;", con))
            using (var rdr = cmdOgm.ExecuteReader())
            {
                if (rdr.Read())
                {
                    return (Convert.ToString(rdr["HeadsorOic"]) ?? "N/A",
                            Convert.ToString(rdr["HeadPos"]) ?? "N/A");
                }
            }
            return ("N/A", "N/A");
        }

        private (string bossName, string position) GetAdminApprover(MySqlConnection con)
        {
            using (var cmdAdmin = new MySqlCommand(@"
SELECT HeadsorOic, COALESCE(NULLIF(positions,''), NAME) AS HeadPos
FROM departmenttb
WHERE ABREVATION = 'ADMIN'
LIMIT 1;", con))
            using (var rdr = cmdAdmin.ExecuteReader())
            {
                if (rdr.Read())
                {
                    return (Convert.ToString(rdr["HeadsorOic"]) ?? "N/A",
                            Convert.ToString(rdr["HeadPos"]) ?? "N/A");
                }
            }
            return ("N/A", "N/A");
        }

        private (string bossName, string position) GetFcdApprover(MySqlConnection con)
        {
            using (var cmdFcd = new MySqlCommand(@"
SELECT HeadsorOic, COALESCE(NULLIF(positions,''), NAME) AS HeadPos
FROM departmenttb
WHERE ABREVATION = 'FCD'
LIMIT 1;", con))
            using (var rdr = cmdFcd.ExecuteReader())
            {
                if (rdr.Read())
                {
                    return (Convert.ToString(rdr["HeadsorOic"]) ?? "N/A",
                            Convert.ToString(rdr["HeadPos"]) ?? "N/A");
                }
            }
            return ("N/A", "N/A");
        }

        private (string bossName, string position) GetTsdApprover(MySqlConnection con)
        {
            using (var cmdTsd = new MySqlCommand(@"
SELECT HeadsorOic, COALESCE(NULLIF(positions,''), NAME) AS HeadPos
FROM departmenttb
WHERE ABREVATION = 'TSD'
LIMIT 1;", con))
            using (var rdr = cmdTsd.ExecuteReader())
            {
                if (rdr.Read())
                {
                    return (Convert.ToString(rdr["HeadsorOic"]) ?? "N/A",
                            Convert.ToString(rdr["HeadPos"]) ?? "N/A");
                }
            }
            return ("N/A", "N/A");
        }

        private (string bossName, string position) GetSubstationTenderApprover(MySqlConnection con)
        {
            using (var cmd = new MySqlCommand(@"
SELECT HeadsorOic, COALESCE(NULLIF(positions,''), NAME) AS HeadPos
FROM departmenttb
WHERE Id = 8
   OR UPPER(REPLACE(COALESCE(NAME,''), ' ', '')) = 'ENGINEERINGSERVICESDEPARTMENT'
   OR UPPER(REPLACE(COALESCE(ABREVATION,''), ' ', '')) = 'ESD'
LIMIT 1;", con))
            using (var rdr = cmd.ExecuteReader())
            {
                if (rdr.Read())
                {
                    string head = Convert.ToString(rdr["HeadsorOic"]) ?? "";
                    string headPos = Convert.ToString(rdr["HeadPos"]) ?? "";
                    if (!string.IsNullOrWhiteSpace(head))
                        return (head, string.IsNullOrWhiteSpace(headPos) ? "ESD Manager" : headPos);
                }
            }

            return ("Engr. Ricky L. Langi", "ESD Manager");
        }

        private (string bossName, string position) GetBranchApproverByArea(MySqlConnection con, string employeeArea)
        {
            string abbr = GetBranchApproverAbbreviation(employeeArea);

            if (string.IsNullOrWhiteSpace(abbr)) return ("", "");

            using (var cmd = new MySqlCommand(@"
SELECT HeadsorOic, COALESCE(NULLIF(positions,''), NAME) AS HeadPos
FROM departmenttb
WHERE UPPER(TRIM(COALESCE(ABREVATION,''))) = UPPER(TRIM(@abbr))
   OR UPPER(REPLACE(COALESCE(ABREVATION,''), ' ', '')) = UPPER(REPLACE(@abbr, ' ', ''))
LIMIT 1;", con))
            {
                cmd.Parameters.AddWithValue("@abbr", abbr);
                using (var rdr = cmd.ExecuteReader())
                {
                    if (rdr.Read())
                    {
                        return (Convert.ToString(rdr["HeadsorOic"]) ?? "N/A",
                                Convert.ToString(rdr["HeadPos"]) ?? "N/A");
                    }
                }
            }

            return ("N/A", "N/A");
        }

        private static string GetBranchApproverAbbreviation(string employeeArea)
        {
            string bucket = ToAreaBucket(employeeArea ?? "");
            switch (bucket)
            {
                case "BASEY":
                    return "BSC";
                case "CATBALOGAN":
                case "CATBALOGAN SUB":
                case "BAGOLIBAS SUB":
                    return "CSC";
                case "VILLAREAL":
                case "VILLAREAL SUB":
                    return "VSC";
                default:
                    return "";
            }
        }

        private static bool ShouldUseBranchAreaApprover(string employeeArea)
        {
            return !string.IsNullOrWhiteSpace(GetBranchApproverAbbreviation(employeeArea));
        }

        private (string bossName, string position) ResolveApproverForEmployee(
            MySqlConnection con,
            string employeeName,
            (string bossName, string position) candidate)
        {
            if (!string.IsNullOrWhiteSpace(candidate.bossName) &&
                !string.Equals(candidate.bossName, "N/A", StringComparison.OrdinalIgnoreCase) &&
                IsSamePersonName(employeeName, candidate.bossName))
            {
                return GetOgmApprover(con);
            }

            return candidate;
        }

        public (string bossName, string position) GetBossNameByDepartment(string departmentName, string employeeName = "", string employeePosition = "", string employeeArea = "")
        {
            string bossName = "N/A"; // Default value
            string position = "N/A"; // Default position
            string dep = (departmentName ?? "").Trim();

            // Query to get department head and title from departmenttb.
            string query = @"
SELECT HeadsorOic, COALESCE(NULLIF(positions,''), NAME) AS HeadPos
FROM departmenttb
WHERE NAME = @departmentName OR ABREVATION = @departmentName
LIMIT 1;";

            using (MySqlConnection mycon = new MySqlConnection(membershipCon.Constring2))
            {
                try
                {
                    mycon.Open();
                    var depNorm = dep.Replace(" ", "").ToUpperInvariant();
                    var posNorm = ((employeePosition ?? "").Trim()).Replace(" ", "").ToUpperInvariant();
                    bool isSubstationTender =
                        posNorm.Contains("SUBSTATIONTENDER") ||
                        posNorm.Contains("SSTENDER") ||
                        dep.Equals("Substation Tender", StringComparison.OrdinalIgnoreCase);

                    if (isSubstationTender)
                    {
                        var substationTender = GetSubstationTenderApprover(mycon);
                        return ResolveApproverForEmployee(mycon, employeeName, substationTender);
                    }

                    bool useBranchByArea = ShouldUseBranchAreaApprover(employeeArea);

                    if (useBranchByArea)
                    {
                        var areaApprover = GetBranchApproverByArea(mycon, employeeArea);
                        if (!string.IsNullOrWhiteSpace(areaApprover.bossName) &&
                            !string.Equals(areaApprover.bossName, "N/A", StringComparison.OrdinalIgnoreCase))
                        {
                            return ResolveApproverForEmployee(mycon, employeeName, areaApprover);
                        }
                    }

                    bool isOgmGroup =
                        depNorm == "OFFICEOFTHEGENERALMANAGER" ||
                        depNorm == "OGM";

                    if (isOgmGroup)
                    {
                        var admin = GetAdminApprover(mycon);
                        return ResolveApproverForEmployee(mycon, employeeName, admin);
                    }

                    bool isTsdGroup =
                        depNorm == "TECHNICALSERVICESDEPARTMENT" ||
                        depNorm == "TSD" ||
                        depNorm.EndsWith("TSD");

                    if (isTsdGroup)
                    {
                        var tsd = GetTsdApprover(mycon);
                        return ResolveApproverForEmployee(mycon, employeeName, tsd);
                    }

                    bool isFcdGroup =
                        depNorm == "DISCONNECTOR" ||
                        depNorm == "MR/COLLECTOR" ||
                        depNorm == "MRCOLLECTOR" ||
                        posNorm == "DISCONNECTOR" ||
                        posNorm == "MR/COLLECTOR" ||
                        posNorm == "MRCOLLECTOR";

                    if (isFcdGroup)
                    {
                        // Special rule: field collections roles use the branch head of the employee area
                        // (for example Catbalogan -> Branch Head Catbalogan from departmenttb).
                        bool isAreaBasedFieldRole =
                            depNorm == "DISCONNECTOR" ||
                            depNorm == "MR/COLLECTOR" ||
                            depNorm == "MRCOLLECTOR" ||
                            posNorm == "DISCONNECTOR" ||
                            posNorm == "MR/COLLECTOR" ||
                            posNorm == "MRCOLLECTOR";
                        if (isAreaBasedFieldRole)
                        {
                            var branchForDisconnector = GetBranchApproverByArea(mycon, employeeArea);
                            if (!string.IsNullOrWhiteSpace(branchForDisconnector.bossName))
                                return ResolveApproverForEmployee(mycon, employeeName, branchForDisconnector);
                        }

                        var fcd = GetFcdApprover(mycon);
                        return ResolveApproverForEmployee(mycon, employeeName, fcd);
                    }

                    bool isSecurityGuard =
                        posNorm.Contains("SECURITYGUARD") ||
                        dep.Equals("Security Guard", StringComparison.OrdinalIgnoreCase);

                    if (isSecurityGuard)
                    {
                        var admin = GetAdminApprover(mycon);
                        return ResolveApproverForEmployee(mycon, employeeName, admin);
                    }

                    var branchByArea = GetBranchApproverByArea(mycon, employeeArea);
                    if (!string.IsNullOrWhiteSpace(branchByArea.bossName))
                    {
                        return ResolveApproverForEmployee(mycon, employeeName, branchByArea);
                    }

                    MySqlCommand cmd = new MySqlCommand(query, mycon);
                    cmd.Parameters.AddWithValue("@departmentName", dep);

                    using (MySqlDataReader reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            bossName = reader["HeadsorOic"].ToString();
                            position = reader["HeadPos"].ToString();
                        }
                    }

                    // If employee is same as department head, approver should be OGM.
                    if (IsSamePersonName(employeeName, bossName))
                    {
                        var ogm = GetOgmApprover(mycon);
                        bossName = ogm.bossName;
                        position = ogm.position;
                    }

                    // If filtered by position (Security Guard), default signature source is ADMIN.
                    if (bossName == "N/A" && dep.Equals("Security Guard", StringComparison.OrdinalIgnoreCase))
                    {
                        var admin = GetAdminApprover(mycon);
                        bossName = admin.bossName;
                        position = admin.position;
                    }
                }
                catch (Exception ex)
                {
                    // MessageBox.Show($"Database Error: {ex.Message}");
                }
            }

            return (bossName, position);
        }





        private void cmddepartment_SelectedIndexChanged_1(object sender, EventArgs e)
        {
            var prev = Cursor.Current;
            Cursor.Current = Cursors.WaitCursor;
            try
            {
                UpdateAreaCheckboxMode();
                AutoCheckAreaByDepartmentSelection();
            }
            finally
            {
                Cursor.Current = prev;
            }
        }

        private DataTable BuildDepartmentDTR(string department, DateTime startDate, DateTime endDate)
        {
            // Schema matches grid + GetDTRData
            var master = new DataTable();
            master.Columns.Add("userID", typeof(string));
            master.Columns.Add("WorkDate", typeof(DateTime));
            master.Columns.Add("Morning_IN", typeof(string));
            master.Columns.Add("Morning_OUT", typeof(string));
            master.Columns.Add("Afternoon_IN", typeof(string));
            master.Columns.Add("Afternoon_OUT", typeof(string));
            master.Columns.Add("OT_IN", typeof(string));
            master.Columns.Add("OT_OUT", typeof(string));
            master.Columns.Add("Morning_IN_Area", typeof(string));
            master.Columns.Add("Morning_OUT_Area", typeof(string));
            master.Columns.Add("Afternoon_IN_Area", typeof(string));
            master.Columns.Add("Afternoon_OUT_Area", typeof(string));
            master.Columns.Add("OT_IN_Area", typeof(string));
            master.Columns.Add("OT_OUT_Area", typeof(string));
            master.Columns.Add("WorkedMinutes", typeof(int));
            master.Columns.Add("Undertime_Min", typeof(int));
            master.Columns.Add("Late_Min", typeof(int));
            master.Columns.Add("LateCount", typeof(int));
            master.Columns.Add("DailyPay", typeof(decimal));
            master.Columns.Add("PerHour", typeof(decimal));
            master.Columns.Add("PerMinute", typeof(decimal));
            master.Columns.Add("OT_Minutes", typeof(int));

            DataTable employees = MembershipDataHelper.GetEmployeesByDepartment(department);
            var addedBioUids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (DataRow emp in employees.Rows)
            {
                string uid = Convert.ToString(emp["bioUID"])?.Trim() ?? "";
                if (string.IsNullOrWhiteSpace(uid) || !addedBioUids.Add(uid))
                    continue;

                string position = Convert.ToString(emp["position"]);

                DataTable dtr = MembershipDataHelper.GetDTRData(uid, position, startDate, endDate, uid);

                foreach (DataRow r in dtr.Rows)
                {
                    var nr = master.NewRow();
                    nr["userID"] = r["userID"];
                    nr["WorkDate"] = r["WorkDate"];
                    nr["Morning_IN"] = r["Morning_IN"];
                    nr["Morning_OUT"] = r["Morning_OUT"];
                    nr["Afternoon_IN"] = r["Afternoon_IN"];
                    nr["Afternoon_OUT"] = r["Afternoon_OUT"];
                    nr["OT_IN"] = r["OT_IN"];
                    nr["OT_OUT"] = r["OT_OUT"];
                    nr["Morning_IN_Area"] = r["Morning_IN_Area"];
                    nr["Morning_OUT_Area"] = r["Morning_OUT_Area"];
                    nr["Afternoon_IN_Area"] = r["Afternoon_IN_Area"];
                    nr["Afternoon_OUT_Area"] = r["Afternoon_OUT_Area"];
                    nr["OT_IN_Area"] = r["OT_IN_Area"];
                    nr["OT_OUT_Area"] = r["OT_OUT_Area"];
                    nr["WorkedMinutes"] = r["WorkedMinutes"];
                    nr["Undertime_Min"] = r["Undertime_Min"];
                    nr["Late_Min"] = r["Late_Min"];
                    nr["LateCount"] = r["LateCount"];  // # Late (Min)
                    nr["DailyPay"] = r["DailyPay"];
                    nr["PerHour"] = r["PerHour"];
                    nr["PerMinute"] = r["PerMinute"];
                    nr["OT_Minutes"] = r["OT_Minutes"];
                    master.Rows.Add(nr);
                }
            }

            master.DefaultView.Sort = "userID ASC, WorkDate ASC";
            return master.DefaultView.ToTable();
        }



        private void datefrom_onValueChanged(object sender, EventArgs e)
        {

        }

        private void datetonow_onValueChanged(object sender, EventArgs e)
        {

        }

        private string GetEmployeePositionByUserId(string userId)
        {
            try
            {
                using (var con = new MySqlConnection(membershipCon.Constring2))
                using (var cmd = new MySqlCommand(
                    @"SELECT position FROM usertb 
              WHERE bioUID=@id OR usercode=@id
              LIMIT 1;", con))
                {
                    cmd.Parameters.AddWithValue("@id", userId);
                    con.Open();
                    var v = cmd.ExecuteScalar();
                    return v == null ? string.Empty : Convert.ToString(v);
                }
            }
            catch { return string.Empty; }
        }



        private void plprint_MouseClick(object sender, MouseEventArgs e)
        {
            // prepare the list of employees
            BuildPrintUserListFromListView();
            _printCursor = 0;

            // wire once
            printDocument3.BeginPrint -= printDocument3_BeginPrint;
            printDocument3.BeginPrint += printDocument3_BeginPrint;

            printDocument3.PrintPage -= printDocument3_PrintPage;
            printDocument3.PrintPage += printDocument3_PrintPage;

            printDocument3.EndPrint -= printDocument3_EndPrint;
            printDocument3.EndPrint += printDocument3_EndPrint;

            // page setup
            ApplyLegalLandscapeTo(printDocument3);

            // show preview
            ShowDtrBatchPrintPreviewDialog();

        }

        private void ShowDtrBatchPrintPreviewDialog()
        {
            using (var form = new Form())
            using (var topPanel = new Panel())
            using (var preview = new PrintPreviewControl())
            using (var printCurrentButton = new Button())
            using (var printAllButton = new Button())
            using (var printRangeButton = new Button())
            using (var previousButton = new Button())
            using (var nextButton = new Button())
            using (var pageNumber = new NumericUpDown())
            using (var pageLabel = new Label())
            using (var closeButton = new Button())
            {
                int totalPages = GetDtrPrintPageCount();

                form.Text = "DTR Print Preview";
                form.WindowState = FormWindowState.Maximized;
                form.StartPosition = FormStartPosition.CenterParent;

                topPanel.Dock = DockStyle.Top;
                topPanel.Height = 44;
                topPanel.BackColor = Color.FromArgb(242, 246, 252);

                printCurrentButton.Text = "Print Page";
                printCurrentButton.Left = 10;
                printCurrentButton.Top = 7;
                printCurrentButton.Width = 90;
                printCurrentButton.Height = 30;
                printCurrentButton.Click += (s, e) =>
                {
                    int currentPreviewPage = Math.Max(1, preview.StartPage + 1);
                    PrintDtrPages(form, currentPreviewPage, currentPreviewPage, totalPages);
                    preview.InvalidatePreview();
                };

                printAllButton.Text = "Print All";
                printAllButton.Left = 106;
                printAllButton.Top = 7;
                printAllButton.Width = 78;
                printAllButton.Height = 30;
                printAllButton.Click += (s, e) =>
                {
                    PrintDtrPages(form, 1, totalPages, totalPages);
                    preview.InvalidatePreview();
                };

                printRangeButton.Text = "Print Range";
                printRangeButton.Left = 190;
                printRangeButton.Top = 7;
                printRangeButton.Width = 95;
                printRangeButton.Height = 30;
                printRangeButton.Click += (s, e) =>
                {
                    int currentPreviewPage = Math.Max(1, preview.StartPage + 1);
                    if (TryChooseDtrPageRange(form, currentPreviewPage, totalPages, out int fromPage, out int toPage))
                    {
                        PrintDtrPages(form, fromPage, toPage, totalPages);
                        preview.InvalidatePreview();
                    }
                };

                previousButton.Text = "<";
                previousButton.Left = 296;
                previousButton.Top = 7;
                previousButton.Width = 36;
                previousButton.Height = 30;
                previousButton.Click += (s, e) =>
                {
                    if (preview.StartPage <= 0) return;
                    pageNumber.Value = preview.StartPage;
                };

                pageLabel.Text = $"Page 1 of {Math.Max(1, totalPages)}";
                pageLabel.Left = 338;
                pageLabel.Top = 12;
                pageLabel.Width = 82;
                pageLabel.Height = 20;
                pageLabel.TextAlign = ContentAlignment.MiddleLeft;

                pageNumber.Left = 426;
                pageNumber.Top = 8;
                pageNumber.Width = 70;
                pageNumber.Height = 28;
                pageNumber.Minimum = 1;
                pageNumber.Maximum = Math.Max(1, totalPages);
                pageNumber.Value = 1;
                pageNumber.ValueChanged += (s, e) =>
                {
                    int page = (int)pageNumber.Value;
                    preview.StartPage = page - 1;
                    pageLabel.Text = $"Page {page} of {Math.Max(1, totalPages)}";
                    previousButton.Enabled = page > 1;
                    nextButton.Enabled = page < totalPages;
                };

                nextButton.Text = ">";
                nextButton.Left = 502;
                nextButton.Top = 7;
                nextButton.Width = 36;
                nextButton.Height = 30;
                nextButton.Click += (s, e) =>
                {
                    if (preview.StartPage + 1 >= totalPages) return;
                    pageNumber.Value = preview.StartPage + 2;
                };

                closeButton.Text = "Close";
                closeButton.Left = 548;
                closeButton.Top = 7;
                closeButton.Width = 85;
                closeButton.Height = 30;
                closeButton.Click += (s, e) => form.Close();

                preview.Document = printDocument3;
                preview.Dock = DockStyle.Fill;
                preview.AutoZoom = true;
                preview.UseAntiAlias = true;
                preview.StartPage = 0;

                topPanel.Controls.Add(printCurrentButton);
                topPanel.Controls.Add(printAllButton);
                topPanel.Controls.Add(printRangeButton);
                topPanel.Controls.Add(previousButton);
                topPanel.Controls.Add(pageLabel);
                topPanel.Controls.Add(pageNumber);
                topPanel.Controls.Add(nextButton);
                topPanel.Controls.Add(closeButton);
                form.Controls.Add(preview);
                form.Controls.Add(topPanel);

                previousButton.Enabled = false;
                nextButton.Enabled = totalPages > 1;
                _printFromPage = 1;
                _printToPage = totalPages;
                _printCursor = 0;
                form.ShowDialog(this);
                _printFromPage = 1;
                _printToPage = int.MaxValue;
                _printCursor = 0;
            }
        }

        private int GetDtrPrintPageCount()
        {
            if (_printUserIds.Count == 0)
                BuildPrintUserListFromListView();

            if (_printUserIds.Count == 0)
                return 1;

            return (int)Math.Ceiling(_printUserIds.Count / (double)_perPage);
        }

        private bool TryChooseDtrPageRange(IWin32Window owner, int currentPage, int totalPages, out int fromPage, out int toPage)
        {
            fromPage = currentPage;
            toPage = currentPage;

            using (var rangeForm = new Form())
            using (var fromLabel = new Label())
            using (var toLabel = new Label())
            using (var fromBox = new NumericUpDown())
            using (var toBox = new NumericUpDown())
            using (var okButton = new Button())
            using (var cancelButton = new Button())
            {
                rangeForm.Text = "Print Page Range";
                rangeForm.FormBorderStyle = FormBorderStyle.FixedDialog;
                rangeForm.StartPosition = FormStartPosition.CenterParent;
                rangeForm.ClientSize = new Size(260, 118);
                rangeForm.MaximizeBox = false;
                rangeForm.MinimizeBox = false;
                rangeForm.ShowInTaskbar = false;

                fromLabel.Text = "From page:";
                fromLabel.Left = 18;
                fromLabel.Top = 18;
                fromLabel.Width = 80;

                fromBox.Left = 105;
                fromBox.Top = 15;
                fromBox.Width = 120;
                fromBox.Minimum = 1;
                fromBox.Maximum = Math.Max(1, totalPages);
                fromBox.Value = Math.Min(Math.Max(1, currentPage), Math.Max(1, totalPages));

                toLabel.Text = "To page:";
                toLabel.Left = 18;
                toLabel.Top = 48;
                toLabel.Width = 80;

                toBox.Left = 105;
                toBox.Top = 45;
                toBox.Width = 120;
                toBox.Minimum = 1;
                toBox.Maximum = Math.Max(1, totalPages);
                toBox.Value = fromBox.Value;

                okButton.Text = "Print";
                okButton.Left = 55;
                okButton.Top = 80;
                okButton.Width = 75;
                okButton.DialogResult = DialogResult.OK;

                cancelButton.Text = "Cancel";
                cancelButton.Left = 140;
                cancelButton.Top = 80;
                cancelButton.Width = 75;
                cancelButton.DialogResult = DialogResult.Cancel;

                rangeForm.Controls.Add(fromLabel);
                rangeForm.Controls.Add(fromBox);
                rangeForm.Controls.Add(toLabel);
                rangeForm.Controls.Add(toBox);
                rangeForm.Controls.Add(okButton);
                rangeForm.Controls.Add(cancelButton);
                rangeForm.AcceptButton = okButton;
                rangeForm.CancelButton = cancelButton;

                if (rangeForm.ShowDialog(owner) != DialogResult.OK)
                    return false;

                fromPage = (int)Math.Min(fromBox.Value, toBox.Value);
                toPage = (int)Math.Max(fromBox.Value, toBox.Value);
                return true;
            }
        }

        private void PrintDtrPages(IWin32Window owner, int fromPage, int toPage, int totalPages)
        {
            fromPage = Math.Max(1, Math.Min(fromPage, Math.Max(1, totalPages)));
            toPage = Math.Max(fromPage, Math.Min(toPage, Math.Max(1, totalPages)));

            using (var printDoc = new PrintDocument())
            using (var dialog = new PrintDialog())
            {
                ApplyLegalLandscapeTo(printDoc);
                printDoc.DocumentName = fromPage == toPage
                    ? $"DTR Page {fromPage}"
                    : $"DTR Pages {fromPage}-{toPage}";

                dialog.Document = printDoc;
                dialog.AllowSomePages = false;
                dialog.AllowSelection = false;
                dialog.UseEXDialog = true;

                if (dialog.ShowDialog(owner) != DialogResult.OK)
                    return;

                int oldFromPage = _printFromPage;
                int oldToPage = _printToPage;
                int oldCurrentPage = _printCurrentPage;

                try
                {
                    _printFromPage = fromPage;
                    _printToPage = toPage;
                    _printCurrentPage = fromPage;
                    _printCursor = 0;

                    dialog.PrinterSettings.PrintRange = PrintRange.AllPages;
                    printDoc.PrinterSettings = dialog.PrinterSettings;
                    ApplyLegalLandscapeTo(printDoc);
                    printDoc.DefaultPageSettings.Margins = new Margins(10, 10, 10, 10);
                    if (printDoc.PrinterSettings?.DefaultPageSettings != null)
                        printDoc.PrinterSettings.DefaultPageSettings.Margins = new Margins(10, 10, 10, 10);

                    printDoc.BeginPrint += printDocument3_BeginPrint;
                    printDoc.PrintPage += printDocument3_PrintPage;
                    printDoc.EndPrint += printDocument3_EndPrint;
                    printDoc.PrintController = new StandardPrintController();
                    printDoc.Print();
                }
                finally
                {
                    printDoc.BeginPrint -= printDocument3_BeginPrint;
                    printDoc.PrintPage -= printDocument3_PrintPage;
                    printDoc.EndPrint -= printDocument3_EndPrint;
                    _printCursor = 0;
                    _printCurrentPage = oldCurrentPage;
                    _printFromPage = oldFromPage;
                    _printToPage = oldToPage;
                }
            }
        }

        public Dictionary<DateTime, string> GetImportantDatesFlexible(
      DateTime fromDate,
      DateTime toDate,
      string empOrUserCode,
      bool wholeYear = false)
        {
            if (wholeYear)
            {
                var y = fromDate.Year;
                fromDate = new DateTime(y, 1, 1);
                toDate = new DateTime(y, 12, 31);
            }

            fromDate = fromDate.Date;
            toDate = toDate.Date;

            var special = new Dictionary<DateTime, string>();

            string TruncateWords(string s, int maxWords = 8)
            {
                if (string.IsNullOrWhiteSpace(s)) return "";
                var parts = s.Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                var full = string.Join(" ", parts);
                var byWords = parts.Length <= maxWords ? full : string.Join(" ", parts.Take(maxWords));
                const int maxChars = 36;
                string final = byWords.Length > maxChars ? byWords.Substring(0, maxChars).TrimEnd() : byWords;
                return string.Equals(final, full, StringComparison.Ordinal) ? final : (final + "...");
            }

            string LeaveShort(string raw)
            {
                if (string.IsNullOrWhiteSpace(raw)) return "LV";
                raw = raw.Trim().ToUpperInvariant();
                if (raw.Contains("SICK")) return "Sick Leave";
                if (raw.Contains("VAC")) return "Vecation Leave";
                if (raw.Contains("EMER")) return "Emergency Leave";
                if (raw.Contains("OFFICIAL")) return "OB";
                if (raw.Contains("SPECIAL")) return "SPL";
                if (raw.Contains("BIRTH")) return "Birth Day";
                if (raw.Contains("MEDICAL")) return "ML";
                if (raw.Contains("PATERNITY")) return "PL";
                if (raw.Contains("UNION")) return "UL";
                if (raw.Contains("FIESTA")) return "FL";
                if (raw.Contains("LWOP") || raw.Contains("WITHOUT")) return "LWOP";
                return new string(raw.Take(2).ToArray());
            }

            string SpacedHoliday(string word) =>
                string.IsNullOrWhiteSpace(word) ? word : string.Join("      ", word.Trim().ToUpper().ToCharArray());

            using (var conn = new MySqlConnection(membershipCon.Constring2))
            {
                conn.Open();

                // 1) HOLIDAYS (top priority)
                using (var cmd = new MySqlCommand(@"
            SELECT holiday_date AS d
            FROM philippine_holidays
            WHERE holiday_date BETWEEN @d1 AND @d2;", conn))
                {
                    cmd.Parameters.AddWithValue("@d1", fromDate);
                    cmd.Parameters.AddWithValue("@d2", toDate);
                    using (var rd = cmd.ExecuteReader())
                    {
                        while (rd.Read())
                        {
                            var d = Convert.ToDateTime(rd["d"]).Date;
                            if (!special.ContainsKey(d))
                                special[d] = SpacedHoliday("HOLIDAY");
                        }
                    }
                }

                // 2) EPASS (single-day only; table has: date, destination, usercode)
                // Match either by provided key, or by resolving between usercode<->bioUID.
                using (var cmd = new MySqlCommand(@"
            SELECT DATE(e.`date`) AS d, e.destination
            FROM epasstb e
            WHERE DATE(e.`date`) BETWEEN @d1 AND @d2
              AND (
                    e.usercode = @key
                 OR e.usercode = (SELECT usercode FROM usertb WHERE bioUID=@key LIMIT 1)
                 OR e.usercode = (SELECT bioUID   FROM usertb WHERE usercode=@key LIMIT 1)
              );", conn))
                {
                    cmd.Parameters.AddWithValue("@d1", fromDate);
                    cmd.Parameters.AddWithValue("@d2", toDate);
                    cmd.Parameters.AddWithValue("@key", empOrUserCode ?? "");
                    using (var rd = cmd.ExecuteReader())
                    {
                        while (rd.Read())
                        {
                            var d = Convert.ToDateTime(rd["d"]).Date;
                            if (special.ContainsKey(d)) continue; // keep holiday label
                            var dest = TruncateWords(Convert.ToString(rd["destination"]) ?? "", 8);
                            special[d] = string.IsNullOrWhiteSpace(dest) ? "" : dest;

                        }
                    }
                }

                // 3) LEAVES (range; will fill all overlapping days)
                using (var cmd = new MySqlCommand(@"
            SELECT datafrom, dateto, leave_record
            FROM tbleave
            WHERE (empId = @key
                   OR empId = (SELECT usercode FROM usertb WHERE bioUID=@key  LIMIT 1)
                   OR empId = (SELECT bioUID   FROM usertb WHERE usercode=@key LIMIT 1))
              AND dateto   >= @d1
              AND datafrom <= @d2;", conn))
                {
                    cmd.Parameters.AddWithValue("@key", empOrUserCode ?? "");
                    cmd.Parameters.AddWithValue("@d1", fromDate);
                    cmd.Parameters.AddWithValue("@d2", toDate);

                    using (var rd = cmd.ExecuteReader())
                    {
                        while (rd.Read())
                        {
                            var df = Convert.ToDateTime(rd["datafrom"]).Date;
                            var dt = Convert.ToDateTime(rd["dateto"]).Date;
                            if (df < fromDate) df = fromDate;
                            if (dt > toDate) dt = toDate;

                            var code = LeaveShort(Convert.ToString(rd["leave_record"]) ?? "");
                            for (var d = df; d <= dt; d = d.AddDays(1))
                                if (!special.ContainsKey(d))
                                    special[d] = code;
                        }
                    }
                }
            }

            return special;
        }




        public Dictionary<DateTime, string> GetImportantDatesForRange_AnyId(
      DateTime fromDate,
      DateTime toDate,
      string anyId)
        {
            fromDate = fromDate.Date;
            toDate = toDate.Date;

            var special = new Dictionary<DateTime, string>(); // date-only keys

            string SpacedHoliday(string word)
                => string.IsNullOrWhiteSpace(word) ? word : string.Join("      ", word.Trim().ToUpper().ToCharArray());

            string LeaveShort(string raw)
            {
                if (string.IsNullOrWhiteSpace(raw)) return "L   E   A   V   E";
                var up = raw.Trim().ToUpperInvariant();
                if (raw.Contains("SICK")) return "Sick Leave";
                if (raw.Contains("VAC")) return "Vecation Leave";
                if (raw.Contains("EMER")) return "Emergency Leave";
                if (raw.Contains("OFFICIAL")) return "OB";
                if (raw.Contains("SPECIAL")) return "SPL";
                if (raw.Contains("BIRTH")) return "Birth Day";
                if (raw.Contains("MEDICAL")) return "ML";
                if (raw.Contains("PATERNITY")) return "PL";
                if (raw.Contains("UNION")) return "UL";
                if (raw.Contains("FIESTA")) return "FL";
                if (up.Contains("LWOP") || up.Contains("WITHOUT")) return "LWOP";
                return new string(up.Take(2).ToArray());
            }

            // local: truncate to N words
            string TruncateWords(string s, int maxWords = 8)
            {
                if (string.IsNullOrWhiteSpace(s)) return "";
                var parts = s.Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                var full = string.Join(" ", parts);
                var byWords = parts.Length <= maxWords ? full : string.Join(" ", parts.Take(maxWords));
                const int maxChars = 36;
                string final = byWords.Length > maxChars ? byWords.Substring(0, maxChars).TrimEnd() : byWords;
                return string.Equals(final, full, StringComparison.Ordinal) ? final : (final + "...");
            }

            // Resolve anyId to both bioUID and usercode (your ResolveIds should do this)
            var ids = ResolveIds(anyId);
            var bio = ids.bioUID ?? string.Empty;
            var uc = ids.usercode ?? string.Empty;

            using (var conn = new MySqlConnection(membershipCon.Constring2))
            {
                conn.Open();

                // 1) HOLIDAYS
                using (var cmd = new MySqlCommand(@"
            SELECT holiday_date AS d
            FROM philippine_holidays
            WHERE holiday_date BETWEEN @d1 AND @d2;", conn))
                {
                    cmd.Parameters.AddWithValue("@d1", fromDate);
                    cmd.Parameters.AddWithValue("@d2", toDate);
                    using (var rd = cmd.ExecuteReader())
                    {
                        while (rd.Read())
                        {
                            var d = Convert.ToDateTime(rd["d"]).Date;
                            if (!special.ContainsKey(d))
                                special[d] = SpacedHoliday("HOLIDAY");
                        }
                    }
                }

                // 2) EPASS (single-date; filter by selected range; match usercode/bioUID)
                //    Do not require status=2 because older/imported EPASS records may use blank/other status values.
                using (var cmd = new MySqlCommand(@"
    SELECT DATE(e.`date`) AS d, COALESCE(e.destination,'') AS destination
    FROM epasstb e
    WHERE DATE(e.`date`) BETWEEN @d1 AND @d2
      AND (
            e.usercode = @uc
         OR e.usercode = @bio
         OR e.usercode = (SELECT usercode FROM usertb WHERE bioUID = @bio LIMIT 1)
         OR e.usercode = (SELECT bioUID FROM usertb WHERE usercode = @uc LIMIT 1)
      );", conn))
                {
                    // bind as DATE and VARCHAR to avoid inference issues
                    var p = cmd.Parameters;
                    p.Add("@d1", MySqlDbType.Date).Value = fromDate.Date;
                    p.Add("@d2", MySqlDbType.Date).Value = toDate.Date;
                    p.Add("@uc", MySqlDbType.VarChar).Value = uc ?? string.Empty;
                    p.Add("@bio", MySqlDbType.VarChar).Value = bio ?? string.Empty;

                    using (var rd = cmd.ExecuteReader())
                    {
                        while (rd.Read())
                        {
                            var d = Convert.ToDateTime(rd["d"]).Date;   // store as DATE-only key
                            if (special.ContainsKey(d)) continue;       // keep Holiday/Leave if present

                            var dest = Convert.ToString(rd["destination"]) ?? string.Empty;
                            var label = TruncateWords(dest, 8);         // keep print tidy

                            // do NOT leave blank: show at least "EPASS"
                            special[d] = string.IsNullOrWhiteSpace(label) ? "EPASS" : label;
                        }
                    }
                }




                // 3) LEAVES (range)
                using (var cmd = new MySqlCommand(@"
            SELECT datafrom, dateto, leave_record
            FROM tbleave
            WHERE (empId = @uc OR empId = @bio
                   OR empId = (SELECT usercode FROM usertb WHERE bioUID=@bio LIMIT 1)
                   OR empId = (SELECT bioUID   FROM usertb WHERE usercode=@uc LIMIT 1))
              AND dateto   >= @d1
              AND datafrom <= @d2;", conn))
                {
                    cmd.Parameters.AddWithValue("@d1", fromDate);
                    cmd.Parameters.AddWithValue("@d2", toDate);
                    cmd.Parameters.AddWithValue("@uc", uc);
                    cmd.Parameters.AddWithValue("@bio", bio);

                    using (var rd = cmd.ExecuteReader())
                    {
                        while (rd.Read())
                        {
                            var df = Convert.ToDateTime(rd["datafrom"]).Date;
                            var dt = Convert.ToDateTime(rd["dateto"]).Date;
                            if (df < fromDate) df = fromDate;
                            if (dt > toDate) dt = toDate;

                            var code = LeaveShort(Convert.ToString(rd["leave_record"]) ?? "");
                            for (var d = df; d <= dt; d = d.AddDays(1))
                                if (!special.ContainsKey(d)) // don’t overwrite Holiday/EPASS
                                    special[d] = code;
                        }
                    }
                }
            }

            return special;
        }
        private (DateTime d1, DateTime d2) GetSelectedRange()
        {
            DateTime d1 = (datefrom != null) ? datefrom.Value.Date : new DateTime(DateTime.Now.Year, DateTime.Now.Month, 1);
            DateTime d2 = (datetonow != null) ? datetonow.Value.Date : d1.AddMonths(1).AddDays(-1);
            if (d2 < d1) d2 = d1;
            return (d1, d2);
        }



        private void printDocument3_PrintPage(object sender, PrintPageEventArgs e)
        {
            try
            {
                var g = e.Graphics;
                int printedPageNumber = _printCurrentPage;
                int totalPages = GetDtrPrintPageCount();

                if (_printUserIds.Count == 0)
                {
                    g.DrawString("No employees to print.", SystemFonts.MessageBoxFont, Brushes.Black, 50, 50);
                    e.HasMorePages = false;
                    return;
                }

                using (var myFont = new Font("Segoe UI", 8))
                using (var myFontB = new Font("Segoe UI", 8, FontStyle.Bold))
                using (var myFontIt = new Font("Segoe UI", 7, FontStyle.Italic))
                {
                    // ---- Layout constants
                    int employeeBlockWidth = 350;

                    int headerCodeY = 20;
                    int headerNameY = 40;
                    int headerMonthY = 60;

                    int rowStartY = 133;
                    int rowHeight = 18;
                    int utColX = 331;

                    int UT_COL_INDEX = dtrlist.Columns.Contains("Undertime_Min")
                        ? dtrlist.Columns["Undertime_Min"].Index
                        : (dtrlist.Columns.Contains("LateCount")
                            ? dtrlist.Columns["LateCount"].Index
                            : -1);

                    // date range from your bunifu pickers
                    var (d1, d2) = GetSelectedRange();

                    int printedOnThisPage = 0;
                    while (_printCursor < _printUserIds.Count && printedOnThisPage < _perPage)
                    {
                        string anyId = _printUserIds[_printCursor];   // can be bioUID or usercode
                        var resolved = ResolveIds(anyId);
                        string targetBio = (resolved.bioUID ?? anyId ?? "").Trim();
                        var (empName, empDept, empUsercode) = GetEmployeeInfo(anyId); // returns usercode too
                        string employeeArea = GetEmployeeAreaByAnyId(anyId);

                        string position = GetEmployeePositionByUserId(anyId);
                        bool isSubstation =
                            string.Equals(position, "Substation Tender", StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(position, "Security Guard", StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(position, "Maintenance", StringComparison.OrdinalIgnoreCase);

                        // rows for this employee in the bound grid
                        var dtrRows = dtrlist.Rows
                            .Cast<DataGridViewRow>()
                            .Where(r => string.Equals(
                                (r.Cells["userID"]?.Value?.ToString() ?? "").Trim(),
                                targetBio,
                                StringComparison.OrdinalIgnoreCase))
                            .ToList();

                        _printCursor++;

                        bool hasAnyPunchForEmployee = dtrRows.Any(r =>
                        {
                            string amIn = Convert.ToString(r.Cells["Morning_IN"]?.Value)?.Trim() ?? "";
                            string amOut = Convert.ToString(r.Cells["Morning_OUT"]?.Value)?.Trim() ?? "";
                            string pmIn = Convert.ToString(r.Cells["Afternoon_IN"]?.Value)?.Trim() ?? "";
                            string pmOut = Convert.ToString(r.Cells["Afternoon_OUT"]?.Value)?.Trim() ?? "";
                            string otIn = dtrlist.Columns.Contains("OT_IN") ? (Convert.ToString(r.Cells["OT_IN"]?.Value)?.Trim() ?? "") : "";
                            string otOut = dtrlist.Columns.Contains("OT_OUT") ? (Convert.ToString(r.Cells["OT_OUT"]?.Value)?.Trim() ?? "") : "";
                            return new[] { amIn, amOut, pmIn, pmOut, otIn, otOut }.Any(s => TryParsePunchTime(s, out _));
                        });
                        if (!hasAnyPunchForEmployee) continue;

                        int blockX = printedOnThisPage * employeeBlockWidth;

                        // headers
                        g.DrawString(empName, myFontB, Brushes.Black, new Point(130 + blockX, headerNameY));
                        g.DrawString(empUsercode, myFont, Brushes.Black, new Point(130 + blockX, headerCodeY));
                        g.DrawString($"Month: {datefrom.Value:MMMM}    |    Area: {ToDisplayAreaName(employeeArea)}", myFont, Brushes.Black, new Point(90 + blockX, headerMonthY));

                        DrawRectangles(g, blockX);
                        var (bossName, bossPos) = GetBossNameByDepartment(string.IsNullOrWhiteSpace(empDept) ? cmddepartment.Text : empDept, empName, position, employeeArea);
                        DrawStaticLabels(g, myFont, myFontB, blockX, isSubstation, empName, position, bossName, bossPos);

                        int totalUndertime = 0;
                        int rowY = rowStartY;

                        // Build specials for this employee & date window (HOLIDAY > EPASS > LEAVE)
                        var specialByDate = GetImportantDatesForRange_AnyId(d1, d2, empUsercode);
                        // Cutoff print behavior:
                        // - 1st cutoff (1-15): show undertime daily
                        // - 2nd cutoff (15/16-end): hide daily UT before day 28, show on 28-31
                        bool isSecondCutoffPrint = d1.Day >= 15;

                        for (DateTime currentDate = d1; currentDate <= d2; currentDate = currentDate.AddDays(1))
                        {
                            bool isWeekend = (currentDate.DayOfWeek == DayOfWeek.Saturday) || (currentDate.DayOfWeek == DayOfWeek.Sunday);

                            // look up specials with Date-only key
                            string specialLabel;
                            bool hasSpecial = specialByDate.TryGetValue(currentDate.Date, out specialLabel);
                            string dayAreaHint = DetectAreaFromText(specialLabel);
                            bool isHolidaySpecial = hasSpecial &&
                                specialLabel.ToUpper().Contains("H      O      L      I      D      A      Y");

                            // read row (if any) for currentDate
                            string amIn = "", amOut = "", pmIn = "", pmOut = "", otIn = "", otOut = "", utCell = "0";
                            string amInArea = "", amOutArea = "", pmInArea = "", pmOutArea = "", otInArea = "", otOutArea = "";
                            bool anyPunch = false, foundRow = false;

                            foreach (var r in dtrRows)
                            {
                                DateTime d;
                                if (DateTime.TryParse(Convert.ToString(r.Cells["WorkDate"]?.Value)?.Trim(), out d) &&
                                    d.Date == currentDate.Date)
                                {
                                    amIn = Convert.ToString(r.Cells["Morning_IN"]?.Value)?.Trim() ?? "";
                                    amOut = Convert.ToString(r.Cells["Morning_OUT"]?.Value)?.Trim() ?? "";
                                    pmIn = Convert.ToString(r.Cells["Afternoon_IN"]?.Value)?.Trim() ?? "";
                                    pmOut = Convert.ToString(r.Cells["Afternoon_OUT"]?.Value)?.Trim() ?? "";
                                    otIn = dtrlist.Columns.Contains("OT_IN") ? (Convert.ToString(r.Cells["OT_IN"]?.Value)?.Trim() ?? "") : "";
                                    otOut = dtrlist.Columns.Contains("OT_OUT") ? (Convert.ToString(r.Cells["OT_OUT"]?.Value)?.Trim() ?? "") : "";
                                    utCell = (UT_COL_INDEX >= 0)
                                        ? (Convert.ToString(r.Cells[UT_COL_INDEX]?.Value)?.Trim() ?? "0")
                                        : "0";
                                    var drv = r.DataBoundItem as DataRowView;
                                    if (drv != null)
                                    {
                                        amInArea = Convert.ToString(drv.Row.Table.Columns.Contains("Morning_IN_Area") ? drv.Row["Morning_IN_Area"] : "") ?? "";
                                        amOutArea = Convert.ToString(drv.Row.Table.Columns.Contains("Morning_OUT_Area") ? drv.Row["Morning_OUT_Area"] : "") ?? "";
                                        pmInArea = Convert.ToString(drv.Row.Table.Columns.Contains("Afternoon_IN_Area") ? drv.Row["Afternoon_IN_Area"] : "") ?? "";
                                        pmOutArea = Convert.ToString(drv.Row.Table.Columns.Contains("Afternoon_OUT_Area") ? drv.Row["Afternoon_OUT_Area"] : "") ?? "";
                                        otInArea = Convert.ToString(drv.Row.Table.Columns.Contains("OT_IN_Area") ? drv.Row["OT_IN_Area"] : "") ?? "";
                                        otOutArea = Convert.ToString(drv.Row.Table.Columns.Contains("OT_OUT_Area") ? drv.Row["OT_OUT_Area"] : "") ?? "";
                                    }

                                    bool hasRegularPunchLocal = new[] { amIn, amOut, pmIn, pmOut }.Any(s => TryParsePunchTime(s, out _));
                                    bool hasOtPunchLocal = new[] { otIn, otOut }.Any(s => TryParsePunchTime(s, out _));
                                    anyPunch = hasRegularPunchLocal || hasOtPunchLocal;
                                    foundRow = true;
                                    break;
                                }
                            }

                            bool hasMiddlePunchForSpecial = TryParsePunchTime(amOut, out _) || TryParsePunchTime(pmIn, out _);
                            if (hasSpecial && !isHolidaySpecial && !hasMiddlePunchForSpecial)
                            {
                                if (IsNoonBoundaryPunch(amOut)) amOut = "";
                                if (IsNoonBoundaryPunch(pmIn)) pmIn = "";
                            }

                            // Keep full-day specials/weekends blank when there are no punches,
                            // but if the employee actually has logs on that date, print and total the row normally.
                            int utForDay = 0;
                            if ((!hasSpecial || anyPunch) && (!isWeekend || anyPunch))
                                utForDay = foundRow ? Math.Min(480, SafeParseMinutes(utCell)) : 480;
                            bool hasRegularPunch = new[] { amIn, amOut, pmIn, pmOut }.Any(s => TryParsePunchTime(s, out _));
                            bool hasOtPunch = new[] { otIn, otOut }.Any(s => TryParsePunchTime(s, out _));
                            if (hasOtPunch && !hasRegularPunch)
                                utForDay = 0; // overtime-only rows do not add undertime

                            if (string.Equals(position, "Security Guard", StringComparison.OrdinalIgnoreCase))
                            {
                                MoveRenderedOvernightPairToShift3(
                                    ref amIn, ref amOut,
                                    ref pmIn, ref pmOut,
                                    ref otIn, ref otOut,
                                    ref amInArea, ref amOutArea,
                                    ref pmInArea, ref pmOutArea,
                                    ref otInArea, ref otOutArea,
                                    ref utForDay);
                            }

                            totalUndertime += utForDay;
                            bool hideUtForThisDay = isSecondCutoffPrint && currentDate.Day < 28;

                            // day number
                            g.DrawString(currentDate.Day.ToString(), myFontB, Brushes.Black, new Point(27 + blockX, rowY));

                            // --- RENDER RULES ---
                            // 1) If special (HOLIDAY / LEAVE / EPASS) and no punches => show the label
                            // 2) Else if weekend with no punches                       => show weekend label
                            // 3) Else                                                  => print the times
                            if (hasSpecial && !anyPunch)
                            {
                                string displayText = specialLabel; // may be spaced "HOLIDAY", or EPASS destination, or "SL/VL/..."
                                Brush textBrush = displayText.ToUpper().Contains("H      O      L      I      D      A      Y")
                                                  ? Brushes.Orange
                                                  : Brushes.Blue;
                                g.DrawString(displayText, myFontB, textBrush, new Point(94 + blockX, rowY));
                            }
                            else if (isWeekend && !anyPunch)
                            {
                                string displayText = (currentDate.DayOfWeek == DayOfWeek.Saturday)
                                                        ? "S    A    T    U    R    D    A    Y"
                                                        : "S      U      N      D      A      Y";
                                g.DrawString(displayText, myFontB, Brushes.Red, new Point(94 + blockX, rowY));
                            }
                            else
                            {
                                // Normal row with times
                                DrawTimeWithAreaMarker(g, myFontB, amIn, 53 + blockX, rowY, employeeArea, string.IsNullOrWhiteSpace(amInArea) ? dayAreaHint : amInArea);
                                DrawTimeWithAreaMarker(g, myFontB, amOut, 98 + blockX, rowY, employeeArea, string.IsNullOrWhiteSpace(amOutArea) ? dayAreaHint : amOutArea);
                                DrawTimeWithAreaMarker(g, myFontB, pmIn, 144 + blockX, rowY, employeeArea, string.IsNullOrWhiteSpace(pmInArea) ? dayAreaHint : pmInArea);
                                DrawTimeWithAreaMarker(g, myFontB, pmOut, 189 + blockX, rowY, employeeArea, string.IsNullOrWhiteSpace(pmOutArea) ? dayAreaHint : pmOutArea);
                                DrawTimeWithAreaMarker(g, myFontB, otIn, 238 + blockX, rowY, employeeArea, string.IsNullOrWhiteSpace(otInArea) ? dayAreaHint : otInArea);
                                DrawTimeWithAreaMarker(g, myFontB, otOut, 279 + blockX, rowY, employeeArea, string.IsNullOrWhiteSpace(otOutArea) ? dayAreaHint : otOutArea);

                                // For EPASS/LEAVE/TO rows with punches:
                                // show the special tag in the middle while noon OUT/IN stays hidden.
                                if (hasSpecial && !isHolidaySpecial && !hasMiddlePunchForSpecial)
                                    g.DrawString(CompactSpecialLabel(specialLabel), myFontB, Brushes.Blue, new Point(104 + blockX, rowY));

                                string utText = (!hideUtForThisDay && utForDay > 0) ? utForDay.ToString() : "";
                                g.DrawString(utText, myFontB, Brushes.Black, new Point(utColX + blockX, rowY));
                            }

                            rowY += rowHeight;
                        }

                        // total (right-aligned)
                        var totalRect = new RectangleF(300 + blockX, 697, 220, 20);
                        using (var sf = new StringFormat { Alignment = StringAlignment.Far, LineAlignment = StringAlignment.Center })
                            g.DrawString($"{totalUndertime:N0}", myFontB, Brushes.Black, totalRect);
                        DrawAreaLegend(g, myFont, 10 + blockX, 800);

                        printedOnThisPage++;
                    }

                    using (var pageFont = new Font("Segoe UI", 8, FontStyle.Bold))
                    using (var sfPage = new StringFormat { Alignment = StringAlignment.Far, LineAlignment = StringAlignment.Center })
                    {
                        var pageText = $"Page {printedPageNumber} of {totalPages}";
                        g.DrawString(pageText, pageFont, Brushes.Black, new RectangleF(0, 8, e.MarginBounds.Right, 18), sfPage);
                    }

                    e.HasMorePages = (_printCursor < _printUserIds.Count && printedPageNumber < _printToPage);
                    if (e.HasMorePages)
                        _printCurrentPage++;
                }
            }
            catch (Exception ex)
            {
                e.Graphics.DrawString("Print error:", SystemFonts.MessageBoxFont, Brushes.Black, 50, 50);
                e.Graphics.DrawString(ex.Message, SystemFonts.MessageBoxFont, Brushes.Red, 50, 70);
                e.HasMorePages = false;
            }

            // helper
            int SafeParseMinutes(string s)
            {
                if (string.IsNullOrWhiteSpace(s)) return 0;
                var digits = new string(s.Where(char.IsDigit).ToArray());
                int m;
                return int.TryParse(digits, out m) ? m : 0;
            }
        }




        // local helper to parse "480", "480 min", "1,200", etc.
        int SafeParseMinutes(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return 0;
            var digits = new string(s.Where(char.IsDigit).ToArray());
            return int.TryParse(digits, out var m) ? m : 0;
        }




        private void RefreshMonthRangeFromUI()
        {
            var from = (datefrom != null ? datefrom.Value.Date : new DateTime(DateTime.Now.Year, DateTime.Now.Month, 1));
            var to = (datetonow != null ? datetonow.Value.Date : from.AddMonths(1).AddDays(-1));
            if (to < from) to = from;
            _monthStart = from;
            _monthEnd = to;
        }






        private void dtrlist_CellContentClick(object sender, DataGridViewCellEventArgs e)
        {

        }

        private void excelexport_MouseClick(object sender, MouseEventArgs e)
        {


            if (dtrlist.Rows.Count == 0)
            {
                MessageBox.Show("No DTR data to export.", "Export", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            using (SaveFileDialog sfd = new SaveFileDialog())
            {
                sfd.Filter = "Excel Workbook|*.xlsx";
                sfd.Title = "Save DTR Report";
                sfd.FileName = $"DTR_{DateTime.Now:MMMM_yyyy}.xlsx";

                if (sfd.ShowDialog() != DialogResult.OK) return;

                Excel.Application app = new Excel.Application();
                Excel.Workbook wb = app.Workbooks.Add(Missing.Value);
                Excel.Worksheet ws = wb.ActiveSheet;

                try
                {
                    app.DisplayAlerts = false; // avoid Excel merge warnings

                    int colCount = dtrlist.Columns.Count - 1;
                    int startRow = 5;

                    // 🏷️ HEADER (Merged)
                    Excel.Range title = ws.Range[ws.Cells[1, 1], ws.Cells[1, colCount]];
                    title.Merge();
                    title.Value = $"SAMELCO II - DAILY TIME RECORD\nMONTH OF {DateTime.Now:MMMM yyyy}";
                    title.WrapText = true;
                    title.RowHeight = 40;
                    title.Font.Size = 15;
                    title.Font.Bold = true;
                    title.Font.Color = ColorTranslator.ToOle(Color.White);
                    title.Interior.Color = ColorTranslator.ToOle(Color.FromArgb(0, 102, 102));
                    title.HorizontalAlignment = Excel.XlHAlign.xlHAlignCenter;
                    title.VerticalAlignment = Excel.XlVAlign.xlVAlignCenter;

                    // 🧩 COLUMN HEADERS
                    for (int i = 0; i < dtrlist.Columns.Count; i++)
                    {
                        if (!dtrlist.Columns[i].Visible) continue;
                        ws.Cells[startRow, i + 1] = dtrlist.Columns[i].HeaderText;

                        Excel.Range headCell = ws.Cells[startRow, i + 1];
                        headCell.Font.Bold = true;
                        headCell.Font.Color = ColorTranslator.ToOle(Color.White);
                        headCell.Interior.Color = ColorTranslator.ToOle(Color.FromArgb(0, 153, 153));
                        headCell.Borders.LineStyle = Excel.XlLineStyle.xlContinuous;
                        headCell.HorizontalAlignment = Excel.XlHAlign.xlHAlignCenter;
                        headCell.VerticalAlignment = Excel.XlVAlign.xlVAlignCenter;
                    }

                    // 🧮 DATA ROWS
                    for (int r = 0; r < dtrlist.Rows.Count; r++)
                    {
                        for (int c = 0; c < dtrlist.Columns.Count; c++)
                        {
                            if (!dtrlist.Columns[c].Visible) continue;

                            ws.Cells[startRow + 1 + r, c + 1] = dtrlist.Rows[r].Cells[c].Value?.ToString() ?? "";

                            Excel.Range cell = ws.Cells[startRow + 1 + r, c + 1];
                            cell.Borders.LineStyle = Excel.XlLineStyle.xlContinuous;
                            cell.HorizontalAlignment = Excel.XlHAlign.xlHAlignCenter;
                            cell.VerticalAlignment = Excel.XlVAlign.xlVAlignCenter;

                            // 🟢 Alternating row color
                            if (r % 2 == 0)
                                cell.Interior.Color = ColorTranslator.ToOle(Color.FromArgb(240, 248, 255));
                        }
                    }

                    // 📊 TOTAL UNDERTIME (SUM)
                    int undertimeCol = dtrlist.Columns["LateCount"].Index + 1;
                    int totalRow = startRow + dtrlist.Rows.Count + 2;

                    ws.Cells[totalRow, undertimeCol - 1] = "TOTAL UNDERTIME (MIN):";
                    ws.Cells[totalRow, undertimeCol - 1].Font.Bold = true;

                    ws.Cells[totalRow, undertimeCol] =
                        $"=SUM({ws.Cells[startRow + 1, undertimeCol].Address}:{ws.Cells[startRow + dtrlist.Rows.Count, undertimeCol].Address})";
                    ws.Cells[totalRow, undertimeCol].Font.Bold = true;
                    ws.Cells[totalRow, undertimeCol].Interior.Color = ColorTranslator.ToOle(Color.FromArgb(255, 255, 200));

                    // 🧾 BORDER FOR ENTIRE TABLE
                    Excel.Range usedRange = ws.Range[ws.Cells[startRow, 1], ws.Cells[startRow + dtrlist.Rows.Count, colCount]];
                    usedRange.Borders.LineStyle = Excel.XlLineStyle.xlContinuous;

                    // 📏 FORMAT & AUTO-FIT
                    ws.Columns.AutoFit();
                    ws.Rows.AutoFit();
                    ws.Range["A1", $"M{totalRow}"].Font.Name = "Segoe UI";
                    ws.Range["A1", $"M{totalRow}"].Font.Size = 10;

                    // 🧾 Footer
                    int footerRow = totalRow + 3;
                    ws.Cells[footerRow, 1] = "Prepared by:";
                    ws.Cells[footerRow, 1].Font.Italic = true;
                    ws.Cells[footerRow, 1].Font.Size = 10;

                    // 💾 Save and open
                    wb.SaveAs(sfd.FileName);
                    wb.Close();
                    app.DisplayAlerts = true;
                    app.Quit();

                    MessageBox.Show($"✅ DTR successfully exported to:\n{sfd.FileName}", "Export Complete", MessageBoxButtons.OK, MessageBoxIcon.Information);

                    // Optional: auto-open
                    System.Diagnostics.Process.Start(sfd.FileName);
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"❌ Export failed:\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    wb.Close(false);
                    app.Quit();
                }
            }
        }

        private void EnsurePreviewInMonthPanel()
        {
            if (PLDTR_BY_MONTH == null) return;

            // reuse if already present
            _previewMonthCtl = PLDTR_BY_MONTH.Controls.OfType<PrintPreviewControl>().FirstOrDefault();
            if (_previewMonthCtl == null)
            {
                _previewMonthCtl = new PrintPreviewControl
                {
                    Name = "previewMonthMyDTR",
                    Dock = DockStyle.Fill,
                    AutoZoom = true
                };
                PLDTR_BY_MONTH.Controls.Add(_previewMonthCtl);
                _previewMonthCtl.BringToFront();
            }

            _previewMonthCtl.Document = _printDocMyMonth;
        }

        private void printDocument3_BeginPrint(object sender, PrintEventArgs e)
        {
            // safety reset at the start of a real print job
            if (_printUserIds.Count == 0)
                BuildPrintUserListFromListView();

            int totalPages = GetDtrPrintPageCount();
            if (_printFromPage < 1) _printFromPage = 1;
            if (_printToPage < _printFromPage) _printToPage = _printFromPage;
            if (_printToPage > totalPages) _printToPage = totalPages;

            _printCurrentPage = _printFromPage;
            _printCursor = Math.Min(_printUserIds.Count, (_printFromPage - 1) * _perPage);
        }

        private void printDocument3_EndPrint(object sender, PrintEventArgs e)
        {
            _printCursor = 0;
            _printCurrentPage = 1;
        }

        private void plleft1_MouseClick(object sender, MouseEventArgs e)
        {

            PL1_EMPOYESS.Dock = DockStyle.None;
            PL1_EMPOYESS.Anchor = AnchorStyles.Top | AnchorStyles.Left;
            PL1_EMPOYESS.Size = new System.Drawing.Size(0, 756);
            PL1_EMPOYESS.BringToFront();

        }

        private void PLDTR_BY_MONTH_Paint(object sender, PaintEventArgs e)
        {

        }

        private void PL1_EMPOYESS_Paint(object sender, PaintEventArgs e)
        {

        }

        private void panel9_Paint(object sender, PaintEventArgs e)
        {

        }

        private void PLBACK_MouseClick(object sender, MouseEventArgs e)
        {
            PL1_EMPOYESS.Dock = DockStyle.None;
            PL1_EMPOYESS.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            PL1_EMPOYESS.Size = new System.Drawing.Size(961, 756);
            PL1_EMPOYESS.BringToFront();



        }
        // ---- create UI inside PLDTR_BY_MONTH ----
        // fields
        private PrintPreviewControl _ppc;

        // call once (e.g., end of Form/UserControl.Load)
        private void SetupPanelPreview()
        {
            // 1) host preview in your panel
            _ppc = new PrintPreviewControl
            {
                Dock = DockStyle.Fill,
                Document = printDocument3,   // your existing PrintDocument
                AutoZoom = false,            // IMPORTANT: must be false to use Zoom
                Zoom = 1.0,                  // 100%
                UseAntiAlias = true
            };
            PLDTR_BY_MONTH.AutoScroll = true;   // scrolling
            PLDTR_BY_MONTH.Controls.Add(_ppc);
        }

        // wire these to your Zoom In / Zoom Out buttons
        private void ZoomIn()
        {
            if (_ppc == null) return;
            _ppc.AutoZoom = false;
            _ppc.Zoom = Math.Max(0.1, Math.Min(5.0, _ppc.Zoom + 0.1)); // 10% step
            _ppc.InvalidatePreview(); // force redraw
        }

        private void ZoomOut()
        {
            if (_ppc == null) return;
            _ppc.AutoZoom = false;
            _ppc.Zoom = Math.Max(0.1, Math.Min(5.0, _ppc.Zoom - 0.1));
            _ppc.InvalidatePreview();
        }

        // optional: fit-to-panel
        private void ZoomAuto()
        {
            if (_ppc == null) return;
            _ppc.AutoZoom = true;
            _ppc.InvalidatePreview();
        }

        // ---- call this once (e.g., in Load) ----
        // SetupMonthlyPreviewUI(PLDTR_BY_MONTH, _printDocMyMonth);





        // one-time setup
        private PictureBox _canvas;

        private void panel9_Click(object sender, EventArgs e)
        {
            string selectedDepartment = cmddepartment.SelectedItem.ToString();
            LoadEmployeesByDepartment(selectedDepartment);
            RefreshDtrFromEmployeeList();
        }

        private float _scale = 1.0f;

        private void SetupZoomableCanvas()
        {
            _canvas = new PictureBox
            {
                Location = new Point(0, 0),
                SizeMode = PictureBoxSizeMode.StretchImage
            };
            PLDTR_BY_MONTH.AutoScroll = true;
            PLDTR_BY_MONTH.Controls.Add(_canvas);

            // e.g., render your DTR page(s) to a bitmap:
            var bmp = new Bitmap(1200, 1800); // whatever your page size is
            using (var g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.White);
                // draw your DTR here...
            }
            _canvas.Image = bmp;

            ApplyScale();
        }

        private void ApplyScale()
        {
            if (_canvas?.Image == null) return;
            _canvas.Width = (int)(_canvas.Image.Width * _scale);
            _canvas.Height = (int)(_canvas.Image.Height * _scale);
        }

        private void panel8_MouseClick(object sender, MouseEventArgs e)
        {
            // 1) Make sure the preview control points to the document
            EnsurePreviewInMonthPanel();
            _previewMonthCtl.Document = _printDocMyMonth;

            // 2) Force Landscape + Long Bond (8.5x13). 
            //    If you actually want Legal (8.5x14), change 1300 -> 1400 above.
            SetLandscapeLongBond(_printDocMyMonth, 10, 10, 10, 10);

            // (optional) cleaner preview, no status dialog during render
            _printDocMyMonth.PrintController = new StandardPrintController();

            // 3) Show fullscreen preview
            using (var dlg = new PrintPreviewDialog())
            {
                dlg.Document = _printDocMyMonth;
                dlg.WindowState = FormWindowState.Maximized;
                dlg.ShowIcon = false;

                // Nice default: fit page in window
                if (dlg.Controls.Count > 0 && dlg.Controls[1] is PrintPreviewControl pvc)
                {
                    pvc.AutoZoom = true;      // let it fit
                    pvc.UseAntiAlias = true;  // smoother text
                }

                dlg.ShowDialog(this);
            }
        }





        // Call this before showing the preview/printing
        private void SetLandscapeLongBond(PrintDocument doc, int marginLeft = 10, int marginRight = 10, int marginTop = 10, int marginBottom = 10)
        {
            if (doc == null) return;

            // Long bond in PH = 8.5" x 13" (NOT 14"). Units are 1/100 inch.
            var longBond = new PaperSize("LongBond_8.5x13", 850, 500)
            {
                // Some drivers respect RawKind=Custom; safe to set.
                RawKind = (int)PaperKind.Custom
            };

            // Landscape + paper
            doc.DefaultPageSettings.Landscape = true;
            doc.DefaultPageSettings.PaperSize = longBond;

            // Also push to printer defaults (helps with some drivers)
            try
            {
                if (doc.PrinterSettings != null && doc.PrinterSettings.DefaultPageSettings != null)
                {
                    doc.PrinterSettings.DefaultPageSettings.Landscape = true;
                    doc.PrinterSettings.DefaultPageSettings.PaperSize = longBond;
                }
            }
            catch { /* ignore driver quirks */ }

            // Tight margins (hundredths of an inch)
            var m = new Margins(marginLeft, marginRight, marginTop, marginBottom);
            doc.DefaultPageSettings.Margins = m;
            try
            {
                if (doc.PrinterSettings?.DefaultPageSettings != null)
                    doc.PrinterSettings.DefaultPageSettings.Margins = m;
            }
            catch { }
        }

        private void PLDTR_BY_MONTH_MouseMove(object sender, MouseEventArgs e)
        {
            _lens?.UpdateFrom(PLDTR_BY_MONTH, e.Location);
        }

        private void plleft1_Paint(object sender, PaintEventArgs e)
        {

        }



        private void LoadYearsFromCheckinout()
        {
            cndyear2.Items.Clear();

            using (MySqlConnection con = new MySqlConnection(membershipCon.Constring2))
            using (MySqlCommand cmd = new MySqlCommand(@"
        SELECT DISTINCT YEAR(CHECKTIME) AS y
        FROM checkinout
        WHERE CHECKTIME IS NOT NULL
          AND YEAR(CHECKTIME) IS NOT NULL
        ORDER BY y DESC;", con))
            {
                con.Open();

                using (MySqlDataReader rd = cmd.ExecuteReader())
                {
                    while (rd.Read())
                    {
                        if (rd.IsDBNull(0))
                            continue;

                        int year = rd.GetInt32(0);
                        cndyear2.Items.Add(year.ToString());
                    }
                }
            }
        }



        private void UpdateRangeFromYearMonth()
        {
            if (string.IsNullOrWhiteSpace(cndyear2.Text) || string.IsNullOrWhiteSpace(cmdmonth2.Text))
                return;

            // Parse year
            if (!int.TryParse(cndyear2.Text.Trim(), out int year))
                return;

            // Parse month from full month name (e.g., "September")
            if (!DateTime.TryParseExact(cmdmonth2.Text.Trim(),
                                        "MMMM",
                                        CultureInfo.InvariantCulture,
                                        DateTimeStyles.None,
                                        out DateTime parsedMonth))
                return;

            int month = parsedMonth.Month;

            DateTime firstDay = new DateTime(year, month, 1);
            DateTime lastDay = firstDay.AddMonths(1).AddDays(-1);

            // If you’re using BunifuDatePicker:
            var bunifuFrom = datefrom;
            var bunifuTo = datetonow;
            if (bunifuFrom != null && bunifuTo != null)
            {
                bunifuFrom.Value = firstDay;
                bunifuTo.Value = lastDay;
            }
            else
            {
                // Otherwise assume TextBox/MaskedTextBox
                string fmt = "MM-dd-yyyy"; // change if you prefer
                datefrom.Text = firstDay.ToString(fmt, CultureInfo.InvariantCulture);
                datetonow.Text = lastDay.ToString(fmt, CultureInfo.InvariantCulture);
            }
        }
        private void LoadMonths()
        {
            cmdmonth2.Items.Clear();
            // Full month names (January … December)
            foreach (var m in DateTimeFormatInfo.InvariantInfo.MonthNames.Where(x => !string.IsNullOrEmpty(x)))
                cmdmonth2.Items.Add(m);
        }

        private void YearOrMonthChanged(object sender, EventArgs e)
        {
            UpdateRangeFromYearMonth();
        }

        private void chckdate_CheckedChanged(object sender, EventArgs e)
        {
            bool expanded = chckdate.Checked;

            this.SuspendLayout();

            if (expanded)
            {
                panel1.Anchor = AnchorStyles.Top | AnchorStyles.Left; // ignored when docking
                panel1.Size = new Size(402, 58);
            }
            else
            {
                panel1.Dock = DockStyle.None;
                panel1.Anchor = AnchorStyles.Top | AnchorStyles.Left;
                panel1.Size = new Size(10, 58);
            }

            panel1.BringToFront();
            this.ResumeLayout();
        }

        //private void WireLensToPanel()
        //{
        //    PLDTR_BY_MONTH.TabStop = true;

        //    PLDTR_BY_MONTH.MouseEnter += (s, ev) => PLDTR_BY_MONTH.Focus();
        //    PLDTR_BY_MONTH.MouseMove += (s, ev) => _lens?.UpdateFrom(PLDTR_BY_MONTH, ev.Location);
        //    PLDTR_BY_MONTH.MouseLeave += (s, ev) => _lens?.Hide();
        //    PLDTR_BY_MONTH.VisibleChanged += (s, ev) => { if (!PLDTR_BY_MONTH.Visible) _lens?.Hide(); };

        //    var form = this.FindForm();
        //    if (form != null)
        //    {
        //        form.Deactivate += (s, ev) => _lens?.Hide();
        //        form.ResizeBegin += (s, ev) => _lens?.Hide();
        //        form.LocationChanged += (s, ev) => _lens?.Hide();
        //    }

        //    // one-time wheel
        //    PLDTR_BY_MONTH.MouseWheel += PLDTR_BY_MONTH_MouseWheel;

        //    // start the watcher timer
        //    if (_lensWatch == null)
        //    {
        //        _lensWatch = new System.Windows.Forms.Timer { Interval = 5 }; // ~16 fps is fine too
        //        _lensWatch.Tick += (s, ev) =>
        //        {
        //            if (_lens == null || !PLDTR_BY_MONTH.IsHandleCreated) return;

        //            // where is the cursor relative to the panel?
        //            var pt = PLDTR_BY_MONTH.PointToClient(Cursor.Position);
        //            bool inside = PLDTR_BY_MONTH.ClientRectangle.Contains(pt) && PLDTR_BY_MONTH.Visible;

        //            if (!inside)
        //            {
        //                if (_lens.Visible) _lens.Hide();     // <-- force hide when outside
        //            }
        //            else
        //            {
        //                // keep the lens updated smoothly while inside
        //                _lens.UpdateFrom(PLDTR_BY_MONTH, pt);
        //            }
        //        };
        //        _lensWatch.Start();
        ////    }
        //}



        //private void PLDTR_BY_MONTH_MouseWheel(object sender, MouseEventArgs e)
        //{
        //    if (_lens == null) return;
        //    float step = (e.Delta > 0) ? +0.2f : -0.2f;
        //    _lens.ChangeZoom(step);

        //    var pos = PLDTR_BY_MONTH.PointToClient(Cursor.Position);
        //    _lens.UpdateFrom(PLDTR_BY_MONTH, pos);
        //}

        // call once (e.g., in Load/constructor after InitializeComponent)











        // wire to buttons
        private void CanvasZoomIn() { _scale = Math.Min(5f, _scale + 0.1f); ApplyScale(); }
        private void CanvasZoomOut() { _scale = Math.Max(1.1f, _scale - 0.1f); ApplyScale(); }



        // Resolve PIDnumber.Text (usercode or even bioUID) -> bioUID from usertb
        private string GetBioUidFromUsercode(string anyId)
        {
            if (string.IsNullOrWhiteSpace(anyId)) return string.Empty;

            try
            {
                using (var con = new MySqlConnection(membershipCon.Constring2))
                using (var cmd = new MySqlCommand(@"
            SELECT bioUID
            FROM usertb
            WHERE usercode=@id OR bioUID=@id
            LIMIT 1;", con))
                {
                    cmd.Parameters.AddWithValue("@id", anyId.Trim());
                    con.Open();
                    var o = cmd.ExecuteScalar();
                    return (o == null) ? string.Empty : Convert.ToString(o);
                }
            }
            catch { return string.Empty; }
        }


        // Load one user’s DTR for the month in cmbMonth -> dataGridView1 + preview
        private void LoadMyMonthlyComputedDTR()
        {
            // 1) source usercode from PIDnumber (fallback to Constring.UserCode)
            string usercode = (PIDnumber != null ? PIDnumber.Text : Constring.UserCode) ?? "";
            if (string.IsNullOrWhiteSpace(usercode)) {; return; }

            var dt = BuildMonthlyDtrDataForUser(usercode, out string bioUid, out string position);
            if (dt == null) return;

            dataGridView1.AutoGenerateColumns = true;
            dataGridView1.DataSource = dt;
            if (dataGridView1.Columns.Contains("WorkDate"))
                dataGridView1.Columns["WorkDate"].DefaultCellStyle.Format = "MM/dd/yyyy";
            foreach (var cn in new[] { "Morning_IN_Area", "Morning_OUT_Area", "Afternoon_IN_Area", "Afternoon_OUT_Area", "OT_IN_Area", "OT_OUT_Area" })
                if (dataGridView1.Columns.Contains(cn)) dataGridView1.Columns[cn].Visible = false;

            // refresh preview
            EnsurePreviewInMonthPanel();
            _printDocMyMonth.PrintPage -= PrintDocMyMonth_PrintPage;
            _printDocMyMonth.PrintPage += PrintDocMyMonth_PrintPage;
            _previewMonthCtl?.InvalidatePreview();

            // keep for headers/signatory
            _myUserIdForMonth = usercode;
        }

        private DataTable BuildMonthlyDtrDataForUser(string usercode, out string bioUid, out string position)
        {
            bioUid = "";
            position = "";

            usercode = (usercode ?? "").Trim();
            if (string.IsNullOrWhiteSpace(usercode))
                usercode = (PIDnumber != null ? PIDnumber.Text : Constring.UserCode) ?? "";
            if (string.IsNullOrWhiteSpace(usercode))
                return null;

            bioUid = GetBioUidFromUsercode(usercode);
            if (string.IsNullOrWhiteSpace(bioUid))
                bioUid = usercode;

            string monthText = (cmbMonth.SelectedItem ?? DateTime.Now.ToString("MMMM")).ToString().Trim().TrimEnd(',');
            if (!DateTime.TryParseExact(monthText, "MMMM", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedMonth))
                parsedMonth = DateTime.Now;

            int month = parsedMonth.Month;
            int year = DateTime.Now.Year;
            _monthStart = new DateTime(year, month, 1);
            _monthEnd = _monthStart.AddMonths(1).AddTicks(-1);

            position = GetEmployeePositionByUserId(usercode);
            if (string.IsNullOrWhiteSpace(position))
                position = GetEmployeePositionByUserId(bioUid);

            var dt = MembershipDataHelper.GetDTRData(
                userId: bioUid,
                position: position,
                startDate: _monthStart,
                endDate: _monthEnd,
                userIDFilter: bioUid);

            if (IsSecurityGuardPosition(position))
                NormalizeGuardMonthRowsToShift3(dt);

            return dt;
        }

        private void DebugCheckUidAndRows(string bioUid, DateTime d1, DateTime d2)
        {
            try
            {
                using (var con = new MySqlConnection(membershipCon.Constring2))
                using (var cmd = new MySqlCommand(@"
            SELECT COUNT(*) FROM checkinout
            WHERE USERID=@uid AND DATE(CHECKTIME) BETWEEN @a AND @b;", con))
                {
                    cmd.Parameters.AddWithValue("@uid", bioUid);
                    cmd.Parameters.AddWithValue("@a", d1.ToString("yyyy-MM-dd"));
                    cmd.Parameters.AddWithValue("@b", d2.ToString("yyyy-MM-dd"));
                    con.Open();
                    var cnt = Convert.ToInt32(cmd.ExecuteScalar() ?? 0);
                    MessageBox.Show($"bioUID: {bioUid}\nRange: {d1:yyyy-MM-dd}..{d2:yyyy-MM-dd}\nRows in checkinout: {cnt}",
                                    "DTR Debug", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Debug error: " + ex.Message);
            }
        }






        private void PLDTR_BY_MONTH_MouseClick(object sender, MouseEventArgs e)
        {

        }

        private void cmbMonth_SelectedIndexChanged(object sender, EventArgs e)
        {
            LoadMyMonthlyComputedDTR();
        }
    }


    // e.Graphics.DrawImage(this.pictureBox1.BackgroundImage, 34 + xx, 20, 50, 60);
}
