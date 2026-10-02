const COUNTRY_OPTIONS=[
  ['ID','Indonesia','+62'],
  ['MY','Malaysia','+60'],
  ['SG','Singapore','+65'],
  ['BN','Brunei','+673'],
  ['TH','Thailand','+66'],
  ['PH','Philippines','+63'],
  ['VN','Vietnam','+84'],
  ['KH','Cambodia','+855'],
  ['LA','Laos','+856'],
  ['MM','Myanmar','+95'],
  ['CN','China','+86'],
  ['TW','Taiwan','+886'],
  ['HK','Hong Kong','+852'],
  ['MO','Macao','+853'],
  ['JP','Japan','+81'],
  ['KR','South Korea','+82'],
  ['IN','India','+91'],
  ['AU','Australia','+61'],
  ['NZ','New Zealand','+64'],
  ['US','United States','+1'],
  ['CA','Canada','+1'],
  ['GB','United Kingdom','+44'],
  ['DE','Germany','+49'],
  ['FR','France','+33'],
  ['IT','Italy','+39'],
  ['ES','Spain','+34'],
  ['NL','Netherlands','+31'],
  ['TR','Turkey','+90'],
  ['SA','Saudi Arabia','+966'],
  ['AE','United Arab Emirates','+971'],
  ['QA','Qatar','+974'],
  ['KW','Kuwait','+965'],
  ['BR','Brazil','+55'],
  ['MX','Mexico','+52']
];

const COUNTRY_MAP=new Map(
  COUNTRY_OPTIONS.map(([code,name,dialCode])=>[
    code,{code,name,dialCode}
  ])
);

function countryOptions(){
  return COUNTRY_OPTIONS.map(([code,name,dialCode])=>({
    code,name,dialCode
  }));
}

function errorOf(code,message){
  const error=new Error(message);
  error.status=400;
  error.code=code;
  error.expose=true;
  return error;
}

function normalizeRecipientContact({email,countryCode,phone}={}){
  const normalizedEmail=String(email||'').trim().toLowerCase();

  if(
    !normalizedEmail ||
    normalizedEmail.length>254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ){
    throw errorOf(
      'RECIPIENT_EMAIL_INVALID',
      'Email penerima tidak valid.'
    );
  }

  const code=String(countryCode||'ID').trim().toUpperCase();
  const country=COUNTRY_MAP.get(code);

  if(!country){
    throw errorOf(
      'RECIPIENT_COUNTRY_INVALID',
      'Negara WhatsApp tidak didukung.'
    );
  }

  const digits=String(phone||'').replace(/\D/g,'');

  if(!/^[1-9]\d{5,13}$/.test(digits)){
    throw errorOf(
      'RECIPIENT_PHONE_INVALID',
      'Nomor WhatsApp tidak valid. Isi nomor tanpa angka 0 di depan.'
    );
  }

  const totalDigits=
    country.dialCode.replace(/\D/g,'').length+
    digits.length;

  if(totalDigits<8||totalDigits>15){
    throw errorOf(
      'RECIPIENT_PHONE_LENGTH_INVALID',
      'Nomor WhatsApp tidak valid.'
    );
  }

  return {
    email:normalizedEmail,
    countryCode:country.code,
    countryName:country.name,
    dialCode:country.dialCode,
    phone:digits,
    phoneE164:country.dialCode+digits
  };
}

function normalizeStoredContact(row){
  if(!row)return null;

  try{
    return normalizeRecipientContact({
      email:row.recipient_email,
      countryCode:row.recipient_country_code,
      phone:row.recipient_phone
    });
  }catch{
    return null;
  }
}

module.exports={
  countryOptions,
  normalizeRecipientContact,
  normalizeStoredContact
};
