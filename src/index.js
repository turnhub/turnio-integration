const express = require("express");
const crypto = require("crypto");
const bodyParser = require("body-parser");
var debug = require("debug")("turn");

const log = label => {
  return val => {
    debug(label);
    return val;
  };
};

class TurnIntegration {
  constructor(secret) {
    this.secret = secret;
    this.contexts = [];
    this.actions = [];
    this.suggestions = [];
    this.secure = true;
    this._verbose = false;
  }

  verbose = () => {
    this._verbose = true;
    return this;
  };

  log = value => {
    if (this._verbose) debug(value);
  };

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

  logRequest = (req, resp, next) => {
    this.log({ body: req.body, headers: req.headers });
    next();
  };

  serve = () => {
    const app = this;
    return express()
      .use(bodyParser.raw({ type: "application/json", inflate: true }))
      .use(app.verifySignature)
      .use(app.logRequest)
      .post("/action/:parentIndex/:index", (req, resp, next) => {
        const parentIndex = parseInt(req.params.parentIndex);
        const index = parseInt(req.params.index);
        const { message, option, payload } = req.body;
        const actionsCallback = app.actions[parentIndex];
        const action = actionsCallback(message)[index];
        debug(`Completed action callback for "${action.description}"`);
        resp.json(action.callback({ message, option, payload }, resp));
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

          const fetchContextObjects = Promise.all(
            app.contexts.map(({ title, type, callback }, index) => {
              return Promise.resolve(callback(req.body, resp)).then(data => ({
                title,
                type,
                data,
                index
              }));
            })
          )
            .then(results =>
              results.reduce((acc, { title, type, data, index }) => {
                acc[`ctx-${index}`] = data;
                return acc;
              }, {})
            )
            .then(log("context objects generated"));

          const fetchActions = Promise.all(
            app.actions.map((callback, parentIndex) => {
              return Promise.resolve(callback(req.body, resp)).then(
                actions => ({
                  actions,
                  parentIndex
                })
              );
            })
          )
            .then(results => {
              return results.reduce((acc, { actions, parentIndex }) => {
                return actions.reduce((acc, action, index) => {
                  const actionId = `act-${parentIndex}-${index}`;
                  acc[actionId] = {
                    description: action.description,
                    payload: action.payload,
                    options: action.options,
                    url: `/action/${parentIndex}/${index}`
                  };
                  return acc;
                }, {});
              }, {});
            })
            .then(log("actions generated"));

          const fetchSuggestedResponses = Promise.all(
            app.suggestions
              .map(callback => callback(req.body, resp))
              .reduce((acc, actions) => acc.concat(actions), [])
          ).then(log("suggested responses generated"));

          return Promise.all([
            fetchActions,
            fetchSuggestedResponses,
            fetchContextObjects
          ]).then(([actions, suggestedResponses, contextObjects]) => {
            resp.json({
              actions: actions,
              suggested_responses: suggestedResponses,
              context_objects: contextObjects
            });
          });
        }
      });
  };
}

module.exports = TurnIntegration;
