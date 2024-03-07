require('dotenv').config();
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var bcrypt = require('bcrypt');
var expressSession = require('express-session');
var mongoose = require('mongoose');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
require('./models');


var User = mongoose.model( 'User' );
mongoose.connect('mongodb://localhost:27017/saas-db');

// Stripe billing api
const stripe = require('stripe')('sk_test_51Or7ruI2Fm500QbJ9heRvppgKPsJLaUU1mNCuGfbqVob3ekUJ5Fo7lzkYi4cSLZtiurvJhtlsi8nGftMH6HqndsU00tTM3EOdV');
var app = express();
const sessionSecret = process.env.SESSION_SECRET || 'your_default_secret';

// ================================================
// view engine setup
// ================================================
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// ================================================
// Middleware setup
// ================================================

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Initial config for expressSession
app.use(expressSession({
  secret: sessionSecret,
  resave: false, // Don't save unmodified sessions
  saveUninitialized: false // Don't create session until something is stored
}));

// Initial config for passport 
// TO DO - Move this configuration to a seperate file 
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy({
  usernameField: 'email'
},
  function(email, password, done) {
    User.findOne({ email: email })
      .then(user => {
        if(!user || !bcrypt.compareSync(password, user.passwordHash)) {
          return done({message: "User not found or password incorrect" });
        }
        return done(null, user);
      })
      .catch(err => {
        return done(err);
      });
  }
));


// strategy for signing up
passport.use('signup-local', new LocalStrategy({
  usernameField: 'email'
},
  (email, password, done) => {
  // check for existing user before creating a new user
  User.findOne({ email: email })
    .then(user => {
      if (user) {
        return done({ message: "user already exists" });
      } else {
        // create new user if it does not already exist
        let newUser = new User({
          email: email,
          passwordHash: bcrypt.hashSync(password, 10)
        });
        return newUser.save()
          .then(user => {
            done(null, user);
          })
      }
    })
    .catch(err => {
      done(err);
    });
  }
));

passport.serializeUser(function(user, done) {
  done(null, user.id); // Here, we serialize the user by storing only the user's id in the session
});

passport.deserializeUser(function(id, done) {
  User.findById(id)
    .then(user => {
      done(null, user); // Here, we retrieve the user by their id
    })
    .catch(err => {
      done(err);
    });
});



// ================================================
// Route handling
// ================================================

// Initial index page
app.get('/', (req, res, next) => {
  res.render('index', {title: "Saas Tutorial"})
});

// Main user dashboard Page
app.get('/main', (req, res, next) => {
  res.render('main', {title: "Saas Dashboard"})
});

app.get('/billing', function (req, res, next) {

  stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      subscription_data: {
          items: [{
              plan: process.env.STRIPE_PLAN,
          }],
      },
      success_url: process.env.BASE_URL + ':3000/billing?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: process.env.BASE_URL + ':3000/billing',
  }, function(err, session) {
      if (err) return next(err);
      res.render('billing', {title: "Billing Dashboard", STRIPE_PUBLIC_KEY: process.env.STRIPE_PUBLIC_KEY, sessionId: session.id})
  });
})

// Login / signup functionality
app.post('/login', 
  passport.authenticate('local', { failureRedirect: '/login-page' }),
  function(req, res) {
    res.redirect('/main');
  });

app.get('/login-page', (req, res, next) => {
  res.render('login-page', {title: "Login Page"})
});

app.post('/signup', 
  passport.authenticate('signup-local', { failureRedirect: '/' }),
  function(req, res) {
    res.redirect('/main');
  });

app.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) {
      next(err);
    } else {
      res.redirect('/');
    }
  });
});


// ================================================
// Error Handling
// ================================================

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
