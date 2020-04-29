const express = require("express");
const crypto = require("crypto");
const bodyParser = require("body-parser");
var debug = require("debug")("turn");
var morgan = require("morgan");

const log = (label) => {
  return (val) => {
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
    this.webhooks = [];
    this.secure = true;
    this._verbose = false;
    this._pathPrefix = "";
  }

  verbose = () => {
    this._verbose = true;
    return this;
  };

  log = (prefix, value) => {
    if (this._verbose) debug(prefix, value);
  };

  ignoreSignature = () => {
    this.secure = false;
    return this;
  };

  sign = (payload) =>
    crypto
      .createHmac("sha256", Buffer.from(this.secret, "utf8"))
      .update(payload)
      .digest()
      .toString("base64");

  context = (title, type, callback) => {
    this.contexts = [
      ...this.contexts,
      { title: title, type: type, callback: callback },
    ];
    return this;
  };

  suggest = (callback) => {
    this.suggestions = [...this.suggestions, callback];
    return this;
  };

  action = (callback) => {
    this.actions = [...this.actions, callback];
    return this;
  };

  hasActions = () => this.actions.length > 0;
  hasSuggestions = () => this.suggestions.length > 0;

  verifySignature = (req, resp, next) => {
    /**
     * If we're running as a google cloud function the raw
     * body is stored in the req.rawBody attribute. For all
     * other usecases we can use the result of the body-parser
     * middleware that sticks the raw buffer in req.body
     */
    if (this.secure) {
      const body = Buffer.from(req.rawBody || req.body).toString();
      const signature = req.get("X-Turn-Hook-Signature");
      const expectedSignature = this.sign(body);
      if (signature === expectedSignature) {
        req.body = JSON.parse(body);
        next();
      } else {
        resp.sendStatus(400).end(next);
      }
    } else {
      if (req.rawBody || req.body) {
        const body = Buffer.from(req.rawBody || req.body).toString();
        req.body = JSON.parse(body);
      }
      next();
    }
  };

  logRequest = (prefix) => {
    return (req, resp, next) => {
      this.log(prefix, { body: req.body, headers: req.headers });
      next();
    };
  };

  pathPrefix = (prefix) => {
    this._pathPrefix = prefix;
    return this;
  };

  webhook = (path, callback) => {
    this.webhooks = [...this.webhooks, { path, callback }];
    return this;
  };

  serve = () => {
    const app = this;
    return express()
      .use(bodyParser.raw({ type: "application/json", inflate: true }))
      .use(app.logRequest("before verify"))
      .use(app.verifySignature)
      .use(app.logRequest("after verify"))
      .use(morgan("short"))
      .post("/health", (res, resp, next) => resp.status(200).send({}))
      .post("/action/:parentIndex/:index", (req, resp, next) => {
        const parentIndex = parseInt(req.params.parentIndex);
        const index = parseInt(req.params.index);
        const { message, option, payload } = req.body;
        const actionsCallback = app.actions[parentIndex];
        const action = actionsCallback(message)[index];
        debug(`Completed action callback for "${action.description}"`);
        resp.json(action.callback({ message, option, payload }, resp));
      })
      .post("/webhook/:path", (req, resp, next) => {
        const webhook = app.webhooks.find(
          ({ path }) => path === req.params.path
        );
        if (webhook) {
          webhook.callback(req, resp, next);
        } else {
          resp.status(404).send("Not Found");
        }
      })
      .post("/", (req, resp, next) => {
        if (req.body.handshake === true) {
          debug("Doing handshake");
          resp.json({
            version: "1.0.0-alpha",
            capabilities: {
              actions: app.hasActions(),
              suggested_responses: app.hasSuggestions(),
              context_objects: app.contexts.map((ctx, index) => ({
                title: ctx.title,
                code: `ctx-${index}`,
                type: ctx.type,
                icon: "none",
              })),
            },
          });
        } else {
          debug("Doing message callback");

          const fetchContextObjects = Promise.all(
            app.contexts.map(({ title, type, callback }, index) => {
              return Promise.resolve(callback(req.body, resp)).then((data) => ({
                title,
                type,
                data,
                index,
              }));
            })
          )
            .then((results) =>
              results.reduce((acc, { title, type, data, index }) => {
                acc[`ctx-${index}`] = data;
                return acc;
              }, {})
            )
            .then(log("context objects generated"));

          const fetchActions = Promise.all(
            app.actions.map((callback, parentIndex) => {
              return Promise.resolve(callback(req.body, resp)).then(
                (actions) => ({
                  actions,
                  parentIndex,
                })
              );
            })
          )
            .then((results) => {
              return results.reduce((acc, { actions, parentIndex }) => {
                return actions.reduce((acc, action, index) => {
                  const actionId = `act-${parentIndex}-${index}`;
                  acc[actionId] = {
                    description: action.description,
                    payload: action.payload,
                    options: action.options,
                    url: `${app._pathPrefix}action/${parentIndex}/${index}`,
                  };
                  return acc;
                }, {});
              }, {});
            })
            .then(log("actions generated"));

          const fetchSuggestedResponses = Promise.all(
            app.suggestions
              .map((callback) => callback(req.body, resp))
              .reduce((acc, actions) => acc.concat(actions), [])
          ).then(log("suggested responses generated"));

          return Promise.all([
            fetchActions,
            fetchSuggestedResponses,
            fetchContextObjects,
          ]).then(([actions, suggestedResponses, contextObjects]) => {
            resp.json({
              actions: actions,
              suggested_responses: suggestedResponses,
              context_objects: contextObjects,
            });
          });
        }
      });
  };
}

module.exports = TurnIntegration;
