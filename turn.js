const express = require("express");

class TurnIntegration {
  TABLE = "table";
  ORDERED_LIST = "ordered-list";
  TEXT = "TEXT";

  constructor() {
    this.contexts = [];
    this.actions = [];
    this.suggestions = [];
  }

  context = (...args) => {
    this.contexts = [args, ...this.contexts];
    return this;
  };

  suggest = (...args) => {
    this.suggestions = [args, ...this.suggestions];
    return this;
  };

  action = (...args) => {
    this.actions = [args, ...this.actions];
    return this;
  };

  serve = () => {
    const app = this;
    return express().get("/:lang/", function(req, resp, next) {
      console.log(app);
      resp.json(req.params);
      next();
    });
  };
}

module.exports = TurnIntegration;
