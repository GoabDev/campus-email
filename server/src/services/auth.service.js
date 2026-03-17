const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/env");
const userRepository = require("../repositories/user.repository");
const { createHttpError } = require("../utils/http-error");

function register(payload) {
  const { email, password, name } = payload;

  if (!email || !password || !name) {
    throw createHttpError(400, "All fields required");
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  try {
    const result = userRepository.createUser(email, hashedPassword, name);
    return { message: "User created", userId: result.lastInsertRowid };
  } catch (error) {
    throw createHttpError(400, "Email already exists");
  }
}

function login(payload) {
  const { email, password } = payload;
  const user = userRepository.findByEmail(email);

  if (!user) {
    throw createHttpError(400, "User not found");
  }

  const valid = bcrypt.compareSync(password, user.password);

  if (!valid) {
    throw createHttpError(400, "Wrong password");
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    jwtSecret,
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar ? `/uploads/avatars/${user.avatar}` : null,
    },
  };
}

module.exports = {
  login,
  register,
};
