const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');

const app = express();
const port = 8080;

app.use(cors());
app.use(compression());

// Have Node serve the files for our built React app
app.use(express.static(path.resolve(__dirname, '../public')));

// listen to app on port 8080
app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});
