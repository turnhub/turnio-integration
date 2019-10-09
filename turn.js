const express = require("express");
const crypto = require("crypto");
const bodyParser = require("body-parser");
var debug = require("debug")("turn");

class TurnIntegration {
  constructor(secret) {
    this.secret = secret;
    this.contexts = [];
    this.actions = [];
    this.suggestions = [];
    this.secure = true;
  }

  ignoreSignature = () => {
    this.secure = false;
    return this;
  };

  sign = payload =>
    crypto
      .createHmac("sha256", Buffer.from(this.secret, "utf8"))
      .update(payload)
      .digest()
      .toString("base64");

  context = (title, type, callback) => {
    this.contexts = [
      ...this.contexts,
      { title: title, type: type, callback: callback }
    ];
    return this;
  };

  suggest = callback => {
    this.suggestions = [...this.suggestions, callback];
    return this;
  };

  action = callback => {
    this.actions = [...this.actions, callback];
    return this;
  };

  hasActions = () => this.actions.length > 0;
  hasSuggestions = () => this.suggestions.length > 0;

  verifySignature = (req, resp, next) => {
    const body = Buffer.from(req.body).toString();
    if (this.secure) {
      const signature = req.get("X-Turn-Hook-Signature");
      const expectedSignature = this.sign(body);
      if (signature === expectedSignature) {
        req.body = JSON.parse(body);
        next();
      } else {
        resp.sendStatus(400).end(next);
      }
    } else {
      req.body = JSON.parse(body);
      next();
    }
  };

  serve = () => {
    const app = this;
    return express()
      .use(bodyParser.raw({ type: "application/json", inflate: true }))
      .use(app.verifySignature)
      .post("/action/:parentIndex/:index", (req, resp, next) => {
        const parentIndex = parseInt(req.params.parentIndex);
        const index = parseInt(req.params.index);
        const { message, option, payload } = req.body;
        const actionsCallback = app.actions[parentIndex];
        const action = actionsCallback(message)[index];
        debug(`Completed action callback for "${action.description}"`);
        resp.json(action.callback({ message, option, payload }));
      })
      .post("/", (req, resp, next) => {
        if (req.body.handshake === true) {
          debug("Doing handshake");
          resp.json({
            capabilities: {
              actions: app.hasActions(),
              suggested_responses: app.hasSuggestions(),
              context_objects: app.contexts.map((ctx, index) => ({
                title: ctx.title,
                code: `ctx-${index}`,
                type: ctx.type,
                icon: "none"
              }))
            }
          });
        } else {
          debug("Doing message callback");
          resp.json({
            actions: app.actions.reduce((acc, callback, parentIndex) => {
              return callback(req.body).reduce((acc, action, index) => {
                const actionId = `act-${parentIndex}-${index}`;
                acc[actionId] = {
                  description: action.description,
                  payload: action.payload,
                  options: action.options,
                  url: `/action/${parentIndex}/${index}`
                };
                return acc;
              }, acc);
            }, {}),
            suggested_responses: app.suggestions.reduce((acc, callback) => {
              return [...acc, ...callback(req.body)];
            }, []),
            context_objects: app.contexts.reduce((acc, ctx, index) => {
              acc[`ctx-${index}`] = ctx.callback(req.body);
              return acc;
            }, {})
          });
        }
      });
  };
}

module.exports = TurnIntegration;
