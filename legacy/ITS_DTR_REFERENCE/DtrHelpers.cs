using System;
using MySql.Data.MySqlClient;

public static class DtrHelpers
{
    //public static int? ResolveBioUidInt(MySqlConnection con, string anyId)
    //{
    //    if (string.IsNullOrWhiteSpace(anyId)) return null;

    //    using (var cmd = new MySqlCommand(@"
    //        SELECT bioUID
    //        FROM usertb
    //        WHERE bioUID = @id OR usercode = @id
    //        LIMIT 1;", con))
    //    {
    //        cmd.Parameters.AddWithValue("@id", anyId.Trim());

    //        var o = cmd.ExecuteScalar();
    //        if (o == null || o == DBNull.Value) return null;

    //        if (int.TryParse(Convert.ToString(o), out int v)) return v;
    //        return null;
    //    }
    //}

    public static string NormalizePunchType(object checkTypeObj, object inoutSmallObj)
    {
        string t = (Convert.ToString(checkTypeObj) ?? "").Trim();
        string s = (Convert.ToString(inoutSmallObj) ?? "").Trim();

        if (t == "I" || t == "O" || t == "i" || t == "o") return t;

        if (string.IsNullOrWhiteSpace(t))
        {
            if (s == "I" || s == "O" || s == "i" || s == "o") return s;

            // common: 0=IN, 1=OUT
            if (int.TryParse(s, out int n))
            {
                if (n == 0) return "I";
                if (n == 1) return "O";
            }
        }

        return "";
    }

    public static DateTime TrimToMinute(DateTime t)
    {
        return new DateTime(t.Year, t.Month, t.Day, t.Hour, t.Minute, 0);
    }
}