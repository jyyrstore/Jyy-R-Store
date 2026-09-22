function idr(value) { return Math.round(Number(value || 0)); }
function formatIDR(value) { return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(idr(value)); }
module.exports = { idr, formatIDR };
