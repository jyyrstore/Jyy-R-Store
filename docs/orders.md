# Orders

Describes order lifecycle, order-item relationships, payment state, fulfillment/delivery state, cancellation/refund handling, and auditability.

Order services should own business transitions; repositories persist state; payment/delivery modules communicate through explicit service contracts.
