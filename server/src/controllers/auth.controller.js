const authService = require("../services/auth.service");

function register(req, res, next) {
  try {
    return res.json(authService.register(req.body));
  } catch (error) {
    return next(error);
  }
}

function login(req, res, next) {
  try {
    return res.json(authService.login(req.body));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  login,
  register,
};
