const {query}=require('../config/database');module.exports={list:async()=>(await query('select * from roles order by code')).rows};
