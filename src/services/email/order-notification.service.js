const {sendTemplate}=require('./mail-queue.service');

async function sendOrderPaidEmail(order){
  const email=String(order?.recipient_email||'').trim();
  if(!email)return null;

  const phone=
    `${order?.recipient_dial_code||''}${order?.recipient_phone||''}`||'—';

  const total=Number(order?.total||0).toLocaleString('id-ID');

  return sendTemplate({
    to:email,
    template:'order-paid',
    title:'Pembayaran berhasil',
    subject:`Pesanan ${order?.order_number||'JYYR Store'} berhasil dibayar`,
    body:[
      `Pesanan: ${order?.order_number||'—'}`,
      `Total: Rp${total}`,
      `WhatsApp: ${phone}`,
      '',
      'Pesanan Anda telah berhasil dibayar dan akses produk diproses oleh JyyR Store.'
    ].join('\n')
  });
}

module.exports={sendOrderPaidEmail};
