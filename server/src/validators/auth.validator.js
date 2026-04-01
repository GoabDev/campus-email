const {
  validateEmailAddress,
  validateRequiredString,
} = require("../utils/validation");

function validateRegisterRequest(req) {
  req.body.email = validateEmailAddress(req.body.email);
  req.body.password = validateRequiredString(req.body.password, "password");
  req.body.name = validateRequiredString(req.body.name, "name");
}

function validateLoginRequest(req) {
  req.body.email = validateEmailAddress(req.body.email);
  req.body.password = validateRequiredString(req.body.password, "password");
}

module.exports = {
  validateLoginRequest,
  validateRegisterRequest,
};
