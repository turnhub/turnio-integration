const server = require("./server");

const port = process.env.PORT || 3000;

server.listen(port, () =>
  console.log(`Example app listening on port ${port}!`)
);
