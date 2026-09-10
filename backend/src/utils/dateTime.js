const getDateParts = (date) => {
  const d = new Date(date);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    date: d,
  };
};

const getDateString = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
};

const getTimeString = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toTimeString().split(' ')[0]; // HH:mm:ss
};

const getDateTimeString = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace('T', ' ').substring(0, 19); // YYYY-MM-DD HH:mm:ss
};

const getDayName = (date) => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const d = new Date(date);
  return days[d.getDay()];
};

const getMonthName = (monthNum) => {
  const months = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return months[monthNum] || '';
};

const getHourFromDate = (date) => {
  const d = new Date(date);
  return d.getHours();
};

const getMinutesFromDate = (date) => {
  const d = new Date(date);
  return d.getMinutes();
};

const getSecondsByDate = (date) => {
  const d = new Date(date);
  return d.getSeconds();
};

const addHours = (date, hours) => {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
};

const addMinutes = (date, minutes) => {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + minutes);
  return d;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const getDaysDifference = (date1, date2) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((d2 - d1) / msPerDay);
};

const getMinutesDifference = (date1, date2) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const msPerMinute = 60 * 1000;
  return Math.floor((d2 - d1) / msPerMinute);
};

const getSecondsDifference = (date1, date2) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.floor((d2 - d1) / 1000);
};

const isSameDay = (date1, date2) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return d1.getFullYear() === d2.getFullYear()
    && d1.getMonth() === d2.getMonth()
    && d1.getDate() === d2.getDate();
};

const isToday = (date) => {
  return isSameDay(date, new Date());
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const startOfMonth = (year, month) => {
  return new Date(year, month - 1, 1);
};

const endOfMonth = (year, month) => {
  return new Date(year, month, 0, 23, 59, 59, 999);
};

module.exports = {
  getDateParts,
  getDateString,
  getTimeString,
  getDateTimeString,
  getDayName,
  getMonthName,
  getHourFromDate,
  getMinutesFromDate,
  getSecondsByDate,
  addHours,
  addMinutes,
  addDays,
  getDaysDifference,
  getMinutesDifference,
  getSecondsDifference,
  isSameDay,
  isToday,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
};
