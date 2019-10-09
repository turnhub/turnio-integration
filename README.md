# Turn.IO Integrations

A javascript helper library to make it easier to write integrations for Turn.io.

> These can be run as google cloud functions.

Here's a sample integration

```javascript
const app = new TurnIntegration(process.env.SECRET_KEY)
  .context("Language", "table", message => ({
    Language: "English",
    Confidence: "Very high"
  }))
  .context("A list of things", "ordered-list", message => [
    "first item",
    "second item",
    "third item"
  ])
  .suggest(message => [
    {
      type: "TEXT",
      title: "Password reset",
      body: "To reset your password click the link on the login page.",
      confidence: 0.4
    }
  ])
  .action(message => [
    {
      description: "Change Language",
      payload: {
        really: "yes"
      },
      options: {
        afr_ZA: "Afrikaans",
        eng_ZA: "English",
        zul_ZA: "Zulu"
      },
      callback: ({ message, option, payload: { really } }) => {
        console.log({ message, option, really });
      }
    }
  ])
  .serve();

module.exports = app;
```

If you want to run this as an expressjs app then:

```javascript
const server = require("./server");

const port = process.env.PORT || 3000;

server.listen(port, () =>
  console.log(`Example app listening on port ${port}!`)
);
```

Run it with:

```bash
PORT=3000 DEBUG=turn SECRET="<your integrations secret>" yarn start
```
