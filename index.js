'use strict';

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const passport = require('passport');

const { PORT, CLIENT_ORIGIN } = require('./config');
const { dbConnect } = require('./db-mongoose');
const { localStrategy, jwtStrategy } = require('./auth/passport');

const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth');
const questionsRouter = require('./routes/questions');

const app = express();

app.use(
  morgan(process.env.NODE_ENV === 'production' ? 'common' : 'dev', {
    skip: (req, res) => process.env.NODE_ENV === 'test'
  })
);

app.use(bodyParser.json());

app.use(
  cors({
    origin: CLIENT_ORIGIN
  })
);

passport.use(jwtStrategy);
passport.use(localStrategy);

app.use('/api/questions', questionsRouter);
app.use('/api/users', usersRouter);
app.use('/api', authRouter);


app.use((req, res, next) => {
  const err = new Error ('Not found');
  err.status = 404;
  next(err);
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err.status) {
    const errBody = Object.assign({}, err, { message: err.message });
    res.status(err.status).json(errBody);
  } else {
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

function runServer(port = PORT) {
  const server = app
    .listen(port, () => {
      console.info(`App listening on port ${server.address().port}`);
    })
    .on('error', err => {
      console.error('Express failed to start');
      console.error(err);
    });
}

if (require.main === module) {
  dbConnect();
  runServer();
}

module.exports = { app };
