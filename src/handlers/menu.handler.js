"use strict";

const { getMenu } = require("../config/command-catalog");

function getMainMenu() {
  return getMenu();
}

module.exports = { getMainMenu };
