const bcrypt = require('bcryptjs');

const hashPassword = async (plainPassword) => {
  const saltRounds = 10;
  return await bcrypt.hash(plainPassword, saltRounds);
};

module.exports = {
  hashPassword
};
