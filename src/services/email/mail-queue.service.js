const email=require('../../config/email');
const templates=require('./template.service');
async function sendTemplate({to,template,title,body,subject}){return email.sendEmail({to,subject:subject||title,html:templates.render(template,{title,body}),text:body});}
module.exports={sendTemplate};
