const ROLES=require('./roles');

const PERMISSIONS=Object.freeze({
  READ_DASHBOARD:'read:dashboard',
  MANAGE_PRODUCTS:'manage:products',
  MANAGE_ORDERS:'manage:orders',
  MANAGE_PAYMENTS:'manage:payments',
  MANAGE_DEPOSITS:'manage:deposits',
  MANAGE_USERS:'manage:users',
  MANAGE_SUPPORT:'manage:support',
  MANAGE_SETTINGS:'manage:settings',
  MANAGE_SECURITY:'manage:security'
});

const ROLE_PERMISSIONS=Object.freeze({
  [ROLES.OWNER]:Object.freeze(['*']),
  [ROLES.ADMIN]:Object.freeze([
    PERMISSIONS.READ_DASHBOARD,
    PERMISSIONS.MANAGE_PRODUCTS,
    PERMISSIONS.MANAGE_ORDERS,
    PERMISSIONS.MANAGE_PAYMENTS,
    PERMISSIONS.MANAGE_DEPOSITS,
    PERMISSIONS.MANAGE_SUPPORT,
    PERMISSIONS.MANAGE_USERS
  ]),
  [ROLES.MODERATOR]:Object.freeze([
    PERMISSIONS.READ_DASHBOARD,
    PERMISSIONS.MANAGE_SUPPORT
  ]),
  [ROLES.USER]:Object.freeze([])
});

module.exports=Object.freeze({
  ...PERMISSIONS,
  ROLE_PERMISSIONS
});
