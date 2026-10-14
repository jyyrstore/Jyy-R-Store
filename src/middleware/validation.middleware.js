const { renderPageFormError } = require('../utils/form-error');

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.flatten().fieldErrors;

      if (renderPageFormError(req, res, {
        status: 422,
        code: 'VALIDATION_ERROR',
        message: 'Data formulir belum valid. Periksa kolom wajib dan format yang diminta, lalu coba lagi.'
      })) {
        return;
      }

      // Kontrak API JSON lama tetap dipertahankan.
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please correct the highlighted fields.',
          details
        }
      });
    }

    req.body = result.data;
    next();
  };
}

module.exports = { validate };
