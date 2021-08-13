require("dotenv").config();
const express = require("express");
var expressWinston = require('express-winston');
var winston = require('winston'); // for transports.Console
const server = express();
const { pool } = require("./dbConfig.js");
const bcrypt = require("bcrypt");
//const cookieParser = require("cookie-parser");
const session = require("express-session");
const passport = require("passport");
//const ROLES = require("./utils/roles.js");
const saltRounds = 10;
const PORT = process.env.PORT || 4000;

server.set("view engine", "ejs");
server.use(express.urlencoded({ extended: true }));
server.use(express.json());

//TODO store secret in .env

server.use(
  session({
    secret: "secret",
    resave: false,
    saveUninitialized: false,
    sameSite: "none",
  })
);
server.use(passport.initialize());
server.use(passport.session());
require(`./passportConfig`)(passport);

// make the express `Router` first.
var router = express.Router();

router.get('/error', function(req, res, next) {
  // cause an error in the pipeline to see express-winston in action.
  return next(new Error("This is an error and it should be logged to the console"));
});

router.get('/', function(req, res, next) {
  res.write('This is a normal request, it should be logged to the console too');
  res.end();
});

// express-winston logger should be BEFORE the router
server.use(expressWinston.logger({
  transports: [
    new winston.transports.Console()
  ],
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.json()
  )
}));

// now tell the app to use the router:
server.use(router);

// express-winston errorLogger goes AFTER the router.
server.use(expressWinston.errorLogger({
  transports: [
    new winston.transports.Console()
  ],
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.json()
  )
}));

server.get("/", (req, res) => {
  
  res.status;
});

router.get("/logout", function(req, res) {
  req.logout();
  res.status;
});

router.get("/login", checkAuthenticated, (req, res) => {
  
  res.status;
});

router.get("/register", checkAuthenticated, (req, res) => {

 res.status;
});

// router.get("/dashboard", checkAuthenticated, (req, res) => {
//   res.redirect(301, "http://localhost:3002/dashboard")
//   //for webpack dev server only
// });


router.get("/isAuthenticated", checkAuthenticated, (req, res) => {
 
  return res.status(200).send("Ok");
});

router.get("/api", function (req, res) { 
  pool.query(
    `SELECT custid, firstname, lastname, email, cell, addr1, addr2, city, st, zip, usertype, createdate FROM customer`,
    (err, results) => {
      if (err) {
        console.error(err);
        res.send(err);
      }
      res.send(results);
    }
  );
});

//get list of subscriptions (locations) for custid
router.post("/listsubscriptions", async (req, res) => {
    let {
      custid
    } = req.body;

    const list = await pool.query(`SELECT COUNT(*) as num FROM subscriber WHERE subscriber.custid = $1`, [custid]);
    console.log(`list: `, list);
    if(list.rows[0].num === '0') {
      return res.status(204).json('No subscriptions');
    }
    return res.status(200).json({list});
});

//get zip for subscription city/st
router.post("/findzip", async (req, res) => {
  try {
    const {
      city,
      state,
    } = req.body;
    const foundZip = await pool.query(`SELECT zipdata.zip FROM zipdata WHERE zipdata.city = $1 AND zipdata.stateid = $2 ORDER BY zipdata.pop DESC LIMIT 1`, [city, state] 
    );
    if (foundZip.rows.length > 0) {
      return res.status(200).send(foundZip);
    }
    return res.status(404).json({msg: `Can't find zip code for ${req.body.city}, ${req.body.state}. Check your spelling.`});
  } catch(err) {
    return (err);
  }
});
 
//add new subscription for custid and zip
router.post("/addsubscription", async (req, res) => {
  try { 
    const foundSubscription = await pool.query(
      `SELECT * from subscriber WHERE subscriber.custid = $1 AND subscriber.zip = $2`, [req.body.custid, req.body.zip]
      );
      if (foundSubscription.rows.length > 0) {
        return res.status(418).send('error: duplicate subscription found');
      } else {
      const {
        custid,
        cell,
        zip,
        nickname,
        weatheralert,
        virusalert,
        airalert,
      } = req.body;
      pool.query(`INSERT INTO subscriber (custid, cell, zip, nickname, weatheralert, virusalert, airalert) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [custid, cell, zip, nickname, weatheralert, virusalert, airalert],
      (err, results) => {
        //Insert failed
        if (err) {
          console.error(`\naddsubscription INSERT failed. error: `, err.message);
          let msg = err.message;
          return res.status(409).send(msg);
          
        //Insert succeeded
        } else {
          console.error(`\naddsubscription INSERT success: `, results);
          return res.status(200).send(results);
        }  
      }
    );
    return res;
    }; 
  } catch(err) {
    return (err);
    } 
  });

//update existing subscription for custid & zip
router.post("/updatesubscription", async (req, res) => {
  try { 
    const {
        custid,
        id,
        cell,
        zip,
        nickname,
        weatheralert,
        virusalert,
        airalert,
      } = req.body;

    const foundSubscription = await pool.query(
      `SELECT * from subscriber WHERE subscriber.custid = $1 AND subscriber.id = $2`, [custid, id]
    )
    if (foundSubscription.rows.length > 0) {
      
      pool.query(`UPDATE subscriber SET cell = $3, zip = $4, nickname = $5, weatheralert = $6, virusalert = $7, airalert = $8 WHERE subscriber.custid = $1 AND subscriber.id = $2 RETURNING *`,
      [custid, id, cell, zip, nickname, weatheralert, virusalert, airalert],
      (err, results) => {
          //Update failed
          if (err) {
            console.error(`\nUpdate subscriptions failed. error: `, err.message);
            let msg = err.message;
            return res.status(409).send(msg);
            
            //Update succeeded
          } else {
            console.error(`\nUpdate subscriptions success: `, results);
            return res.status(200).send(results);
          }  
        }
      );
    } else {
      return res.status(400).json({msg: 'Subscription not found'})
    }
  } catch(err) {
    return (err);
  } 
});

//delete subscription for custid & zip
router.post("/deletesubscription", async function (req, res) {
  const {
    id,
    custid,
  } = req.body;
  pool.query(
    `DELETE from subscriber WHERE subscriber.id = $1 AND subscriber.custid = $2 RETURNING id, custid`,
    [id, custid],
    (err, results) => {
      //delete failed
      if (err) {
        console.error(`\nDelete Subscription failed. error: `, err.message);
        let msg = err.message;
        return res.status(409).send(msg);
      } else {
        console.error(`\nDelete subscription success: `, results);
        let msg = results;
        return res.status(200).send(msg);
      }
    });
});

//get list of friends for custid
router.put("/friends", function (req, res) {
  const {
    custid
  } = req.body;

 pool.query (
   'SELECT friends.firstname, friends.zip, friends.cell, friends.id from friends WHERE friends.custid = $1', [custid],
   (err, results) => {
    if (err) {
      console.error(err);
      res.send(err);
    }
    return res.status(200).send(results);
  });
});

//add new friend for custid
router.post("/friend", async function (req, res) {
  const {
    custid,
    firstname,
    zip,
    cell,
  } = req.body;
  
  pool.query(`INSERT INTO friends (custid, firstname, zip, cell) VALUES ($1, $2, $3, $4) RETURNING *`,
    [custid, firstname, zip, cell],
    (err, results) => {
      //Insert failed
      if (err) {
        console.error(`\nFriend INSERT failed. error: `, err.message);
        let msg = err.message;
        return res.status(409).send({msg});
        
      //Insert succeeded
      } else {
        console.error(`\nFriend INSERT success: `, results);
        let msg = results.message;
        return res.status(200).send({msg});
      }  
    }
  );
  return res.status;
});

//update existing friend for custid & id
router.put("/friend", async function (req, res){
   const {
    custid,
    firstname,
    zip,
    cell,
    id,
  } = req.body;
  pool.query(
    'UPDATE friends SET firstname = $2, zip = $3, cell = $4 WHERE friends.custid = $1 AND friends.id = $5 RETURNING *',
    [custid, firstname, zip, cell, id],
    (err, results) => {
        //Update failed
        if (err) {
          console.error(`\nUpdate Friend failed. error: `, err.message);
          let msg = err.message;
          return res.status(409).send({msg});
          
          //Update succeeded
        } else {
          console.error(`\nUpdate Friend success: `, results.rowCount+1);
          let msg = results.rowCount+1;
          return res.status(200).send({msg});
        }  
      }
    );
});

//delete friend for custid & id
router.post("/deletefriend", async function (req, res) {
  const {
    custid,
    id,
  } = req.body;
  pool.query(
    'DELETE from friends WHERE friends.custid = $1 AND friends.id = $2 RETURNING *',
    [custid, id],
    (err, results) => {
      //delete failed
      if (err) {
        console.error(`\nDelete friend failed. error: `, err.message);
        let msg = err.message;
        return res.status(409).send({msg});
      } else {
        console.error(`\nDelete friend success: `, results);
        let msg = results;
        return res.status(200).send({msg});
      }
    });
});

//update existing customer profile
router.put("/profile", async function (req, res) {
  console.error(`PUT /profile req.body: `, req.body);
  const {
    custid, 
    firstname, 
    lastname, 
    email, 
    cell, 
    addr1, 
    addr2, 
    city, 
    st, 
    zip, 
    pwd, 
    usertype, 
  } = req.body;

  if(pwd) {
    let hashedPwd = await bcrypt.hash(pwd, saltRounds);
  //update existing Customer with NEW password
  console.error(`\nUpdate with new password. req.body: `, req.body);
  pool.query(
    'UPDATE customer SET firstname = $2, lastname = $3, email = $4, cell = $5, addr1 = $6, addr2 = $7, city = $8, st = $9, zip = $10, usertype = $11, pwd = $12 WHERE customer.custid = $1 RETURNING *',
    [custid, firstname, lastname, email, cell, addr1, addr2, city, st, zip, usertype, hashedpwd],
    (err, results) => {
        //Update failed
        if (err) {
          console.error(`\nProfile Update failed. error: `, err.message);
          let msg = err.message;
          return res.status(409).send({msg});
          
          //Update succeeded
        } else {
          console.error(`\nProfile Update success: `, results.rowCount+1);
          let msg = results.rowCount+1;
          return res.status(200).send({msg});
        }  
      }
    );
  } else {
    //update customer with existing password
    console.error(`\nUpdate with existing password. req.body: `, req.body);
    pool.query(
    'UPDATE customer SET firstname = $2, lastname = $3, email = $4, cell = $5, addr1 = $6, addr2 = $7, city = $8, st = $9, zip = $10, usertype = $11 WHERE customer.custid = $1 RETURNING *',
    [custid, firstname, lastname, email, cell, addr1, addr2, city, st, zip, usertype],
    (err, results) => {
        //Update failed
        if (err) {
          console.error(`\nUpdate failed. error: `, err.message);
          let msg = err.message;
          return res.status(409).send(msg);
          
          //Update succeeded
        } else {
          console.error(`\nUpdate success: `, results.rowCount);
          let msg = results.rowCount;
          return res.status(200).send(msg);
        }  
      }
    );
  };
  //return res.status;
});

//check for duplicate email
router.post("/checkemail", async (req, res) => {
  try {
    const {
      value
    } = req.body;

    const foundEmail = await pool.query(`SELECT customer.email FROM customer WHERE customer.email = $1`, [value]
    );
    if (foundEmail.rows.length > 0) {
      return res.status(200).send(foundEmail);
    }
    return res.status(404).json({msg: `Email ${req.body.value} not found`});
  } catch(err) {
      return (err);
    }  
});

//add new Customer
router.post("/register", async (req, res) => {
  let {
    firstname,
    lastname,
    email,
    cell,
    addr1,
    addr2,
    city,
    st,
    zip,
    pwd,
    usertype,
  } = req.body;

  let hashedpwd = await bcrypt.hash(pwd, saltRounds);
  usertype = "customer";
  console.log(`\nPOST register req.body: `, req.body);
  //insert new Customer
  pool.query(`INSERT INTO customer (firstname, lastname, email, cell, addr1, addr2, city, st, zip, pwd, usertype)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING custid`,
    [firstname, lastname, email, cell, addr1, addr2, city, st, zip, hashedpwd, usertype],
    (err, result) => {
      //Insert failed
      if (err) {
        console.error(`\nRegister INSERT failed. error: `, err.message);
        let msg = err.message;
        return res.status(409).send(msg);
        
      //Insert succeeded
      } else {
        console.error(`\nRegister INSERT success: `, result);
        return res.status(200).send(result);
      }  
    }
  );
  return res.status;
});

router.post("/login", passport.authenticate("local"), function (req, res) {
  // If this function gets called, authentication was successful.
  // `req.user` contains the authenticated user.
  let msg = {custid: req.user.custid, 
    firstname: req.user.firstname, 
    lastname: req.user.lastname,
    email: req.user.email,
    cell: req.user.cell,
    addr1: req.user.addr1,
    addr2: req.user.addr2,
    city: req.user.city,
    st: req.user.st,
    zip: req.user.zip, 
    usertype: req.user.usertype};
  return res.status(200).json({msg});
});

function checkAuthenticated(req, res, next) {
  if(req.isAuthenticated()) {
    console.log(`\ncheckAuthenticated res: `, res);
    return next();
  }
  res.status(401).json("not authenticated");
}

server.listen(PORT, () => {
  console.error(`Server is running on port ${PORT}`);
});
