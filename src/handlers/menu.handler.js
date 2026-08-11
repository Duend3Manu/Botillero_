"use strict";

const { getMenu } = require("../config/command-catalog");
const featureFlags = require("../services/feature-flags.service");

function getMainMenu() {
  return getMenu(featureFlags.getDisabled());
}

module.exports = { getMainMenu };
