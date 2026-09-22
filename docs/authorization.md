# Authorization

Defines authorization as Authentication → Role → Permission → Controller/Service enforcement. Owner capabilities must be verified server-side and never trusted solely because a client displays an owner interface.

The final implementation must map roles and permissions to the database/RLS access model and provide explicit deny behavior.
