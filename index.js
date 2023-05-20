const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const compression = require("compression");
require("dotenv").config();
const SSLCommerzPayment = require("sslcommerz-lts");
const http = require("http");
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");
app.use(cors());
const cheerio = require("cheerio");
const sanitizeHtml = require("sanitize-html");
const httpServer = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "https://freemiumarticles.web.app"],
    // or with an array of origins ["http://localhost:3000", "https://freemiumarticles.web.app"]
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  },
});
const nodemailer = require("nodemailer");
const mg = require("nodemailer-mailgun-transport");
// const sgMail = require('@sendgrid/mail');
// sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const axios = require("axios");
// step one
const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);
// cookie parser
const cookieParser = require("cookie-parser");
const port = process.env.PORT;

// middlewares
app.use(express.json());
app.use(cookieParser());
app.use(compression());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

/*===============
all socket work
================= */
let users = [];
// add log in  user
const addUsers = (userId, socketId, userInfo) => {
  const checkUser = users.some((u) => u._id === userId);
  if (!checkUser) {
    users.push({ userId, socketId, userInfo });
  }
};

// const users = {};

// remove log out user
const userRemove = (socketId) => {
  users = users?.filter((u) => u?.socketId !== socketId);
};
const findFriend = (id) => {
  return users.find((u) => u?.userId === id);
};
// Connection
io.on("connection", (socket) => {
  socket.on("addUser", (singleUsersId, singleUsers) => {
    addUsers(singleUsersId, socket.id, singleUsers);

    io.emit("getUsers", users);
  });
  // send message
  socket.on("sendMessage", (data) => {
    const user = findFriend(data?.reciverId);
    // console.log(data);
    if (user !== undefined) {
      socket.to(user.socketId).emit("getMessage", {
        senderId: data?.senderId,
        senderName: data?.senderName,
        reciverId: data?.reciverId,
        message: data?.message,
        createAt: data?.date,
      });
    }
    // io.emit("getMessage", users);
  });

  // get typing message
  socket.on("typingMessage", (data) => {
    const user = findFriend(data?.reciverId);
    if (user !== undefined) {
      socket.to(user?.socketId).emit("getTypingMessage", {
        senderId: data?.senderId,
        reciverId: data?.reciverId,
        msg: data?.msg,
      });
    }
  });
});

io.on("disconnect", () => {
  userRemove(socket.id);
  io.emit("getUsers", users);
});
// user disconnet
// socket.on("disconnect", () => {
//   // remove the user from our list of users
//   delete users[socket.id];
//   // notify the other users that a user has left
//   socket.broadcast.emit("user left", socket.id);
// });

/*===============
sslcommerz
================*/

// sslcommerz
const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASSWORD;
const is_live = false; //true for live, false for sandbox

// Mongo DB Connections
// get update code
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

//Verify JWT function
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  //
  if (!authHeader) {
    return res.status(403).send("Not authorization");
  }
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (error, decoded) {
    if (error) {
      return res.status(403).send({ message: "Forbidden" });
    }
    req.decoded = decoded;

    next();
  });
}

// check main route
app.get("/", (req, res) => {
  res.send(`FreeMium Articles running on port ${port}`);
});

function sendPaymentEmail(PaidUserEmail, paidUser) {
  const { name, phone, email, amount, transactionId } = paidUser;
  //   let transporter = nodemailer.createTransport({
  //     host: 'smtp.sendgrid.net',
  //     port: 587,
  //     auth: {
  //         user: "apikey",
  //         pass: process.env.SENDGRID_API_KEY
  //     }
  //  })
  const auth = {
    auth: {
      api_key: process.env.EMAIL_SEND_KEY,
      domain: process.env.EMAIL_SEND_DOMAIN,
    },
  };

  const transporter = nodemailer.createTransport(mg(auth));

  transporter.sendMail(
    {
      from: "md.sifat.ur.rahman2702@gmail.com", // verified sender email
      to: PaidUserEmail, // recipient email
      subject: "Membership of FreeMium Articles", // Subject line
      text: "Congratulations you have got the membership of FreeMium website.", // plain text body
      html: `<head>
  <style>
        table {
          border-collapse: collapse;
          
        }
        th, td {
          
          padding: 26px;
          border: 1px solid black;
        }
        th {
          background-color: #ddd;
        }
        
      </style>
      </head>
      <h1>Congratulations you have got the membership of FreeMium website. </h1>
  <table>
  <tr>
    <th>Name</th>
    <th>${name}</th>
    
  </tr>
  <tr>
    <td>Email</td>
    <td>${email}</td>
    
  </tr>
  <tr>
    <td>Phone Number</td>
    <td>${phone}</td>
    
  </tr>
  <tr>
    <td>Amount</td>
    <td>${amount}</td>
    
  </tr>
  <tr>
    <td>Transaction Id</td>
    <td>${transactionId}</td>
    
  </tr>
</table>
<h3>Save your transaction ID for later use </h3>
`, // html body
    },
    function (error, info) {
      if (error) {
      } else {
      }
    }
  );
}

async function run() {
  try {
    const usersCollection = client.db("freeMiumArticle").collection("users");
    const notificationCollection = client
      .db("freeMiumArticle")
      .collection("notifications");
    const viewsCollection = client.db("freeMiumArticle").collection("views");
    const messagesCollection = client
      .db("freeMiumArticle")
      .collection("messages");
    const articleCollection = client
      .db("freeMiumArticle")
      .collection("homePosts");
    const categoryButtonCollection = client
      .db("freeMiumArticle")
      .collection("categoryItem");
    const paymentCollection = client
      .db("freeMiumArticle")
      .collection("payment");

    // comment collection
    const commentCollection = client
      .db("freeMiumArticle")
      .collection("comments");

    const saveArticleCollection = client
      .db("freeMiumArticle")
      .collection("saveArticle");
    // API collection
    const apiAnsCollection = client
      .db("freeMiumArticle")
      .collection("apiAnsCollection");

    // Verfy Admin function
    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const admin = await usersCollection.findOne(query);
      if (admin?.role !== "admin") {
        return res.status(403).send(`You dose't have access to edit this`);
      }
      next();
    };

    // user route
    app.put("/user/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const option = { upsert: true };
      const updateDoc = {
        $set: {
          verify: true,
        },
      };
      const updateUser = await usersCollection.updateOne(
        filter,
        updateDoc,
        option
      );
      res.send(updateUser);
    });

    // Update user profile
    // app.patch("/user/:userId", async (req, res) => {
    //   try {
    //     const updatedUser = usersCollection.updateOne(
    //       req.params.userId,
    //       { $set: req.body },
    //       { new: true }
    //     );

    //     res.json(updatedUser);
    //   } catch (err) {
    //     res.status(500).json({ message: err.message });
    //   }
    // });
    app.patch("/update-profile/:id", (req, res) => {
      const id = req.params.id;
      const user = req.body;

      usersCollection.updateOne(
        { _id: ObjectId(id) },
        { $set: user },
        (err, result) => {
          if (err) {
            console.error(err);
            res
              .status(500)
              .send({ message: "Error updating the user profile" });
          } else {
            res
              .status(200)
              .send({ message: "User profile updated successfully" });
          }
        }
      );
    });

    // get user data
    app.get("/all-users", async (req, res) => {
      const query = {};
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });
    // app.get('/searchUser/:query', (req, res) => {
    //   const query = req.query.query;

    //   usersCollection.find({ $text: { $search: query } }).toArray((err, results) => {
    //     if (err) {
    //       console.error('Error searching MongoDB:', err);
    //       res.status(500).json({ error: 'Internal server error' });
    //       return;
    //     }

    //     // Send back the results as a JSON response
    //     res.json({ results });
    //   });
    // });
    // search user
    app.get("/writer-search/:query", async (req, res) => {
      const query = req.params.query;
      const regex = new RegExp(query, "i");
      // console.log(regex);
      const suggestions = await usersCollection
        .find({ name: { $regex: regex } }, { name: 1 })
        .toArray();
      const userName = await usersCollection
        .find({ $text: { $search: query } })
        .toArray();
      res.json({ userName, suggestions });
    });
    // delete user
    app.delete("/writer-delete/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await usersCollection.deleteOne(filter);
      res.send(result);
    });
    // limit depend on the user call
    app.get("/all-users/:selectNumber", async (req, res) => {
      const userSelect = req.params.selectNumber;
      const query = {};
      const result = await usersCollection
        .find(query)
        .limit(+userSelect)
        .toArray();
      res.send(result);
    });
    // get user data
    app.get("/user", async (req, res) => {
      const query = {};
      const result = await usersCollection.find(query).limit(6).toArray();
      res.send(result);
    });
    // get three user data
    app.get("/three-users", async (req, res) => {
      const query = {};
      const result = await usersCollection.find(query).limit(3).toArray();
      res.send(result);
    });
    // Get Data category name
    app.get("/category/:name", async (req, res) => {
      const categoryName = req.params.name;
      const query = { category: categoryName };
      //
      const result = await articleCollection.find(query).toArray();
      res.send([{ categoryName: categoryName }, result]);
    });

    // Update users
    app.put("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const option = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const updateUser = await usersCollection.updateOne(
        filter,
        updateDoc,
        option
      );

      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });
      res.send({ updateUser, token });
    });

    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: "1d",
        });
        return res.send({ freeMiumToken: token });
      }
      res.status(401).send({ message: "Unauthorized" });
    });

    // Get admin user permission
    app.get("/users/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;

      const query = { email };
      const adminUser = await usersCollection.findOne(query);

      res.send({ isAdmin: adminUser?.role === "admin" });
    });
    // all articles
    app.get("/allArticles", async (req, res) => {
      const query = {};
      // const article = await articleCollection.find(query).toArray();
      const article = await articleCollection
        .find(query)
        .sort({ timestamp: -1 })
        .toArray();
      res.send(article);
    });
    app.get("/limit-articles", async (req, res) => {
      const query = {};
      const article = await articleCollection
        .find(query)
        .limit(3)
        .sort({ timestamp: -1 })
        .toArray();
      res.send(article);
    });

    // Edit Article
    app.put("/editArticle/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const data = req.body;

      const option = { upsert: true };
      const updateData = {
        $set: {
          articleTitle: data.titles,
          articleDetails: data.detailsStory,
        },
      };

      const result = await articleCollection.updateOne(
        filter,
        updateData,
        option
      );
      res.send(result);
    });
    // Edit Article = articleType
    app.put("/editArticleType/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const data = req.body;
      const option = { upsert: true };
      const updateData = {
        $set: {
          articleType: data.articleType,
        },
      };

      const result = await articleCollection.updateOne(
        filter,
        updateData,
        option
      );
      res.send(result);
    });
    /*========================
        category api
      ======================== */

    // create new category
    app.post("/addNewCategory", async (req, res) => {
      const category = req.body;
      const result = await categoryButtonCollection.insertOne(category);
      res.send(result);
    });
    // category button api
    app.get("/categoryButton", async (req, res) => {
      const query = {};
      const categoryButton = await categoryButtonCollection
        .find(query)
        .toArray();
      res.send(categoryButton);
    });

    // get specific category by id
    app.get("/categoryButton/:id", async (req, res) => {
      const id = req.params.id;

      const query = { _id: ObjectId(id) };
      const result = await categoryButtonCollection.findOne(query);
      res.send(result);
    });
    // delete category
    app.delete("/categoryButton/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await categoryButtonCollection.deleteOne(filter);
      res.send(result);
    });

    // updater category
    app.put("/updateCategory/:id", async (req, res) => {
      const id = req.params.id;
      const categoryName = req.body.categoryName;

      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          CategoryName: categoryName,
        },
      };
      //
      const result = await categoryButtonCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });
    /*====================
         story api
    ======================*/
    // store api
    app.post("/add-story", async (req, res) => {
      try {
        const {
          articleDetails,
          userId,
          userEmail,
          writerName,
          writerImg,
          articleTitle,
          articleRead,
          articleImg,
          category,
          articleType,
        } = req.body;

        // Create a new story
        const story = await articleCollection.insertOne({
          articleDetails,
          userId,
          userEmail,
          writerName,
          writerImg,
          articleTitle,
          timestamp: new Date(),
          articleRead,
          articleImg,
          category,
          articleType,
        });

        // Fetch the list of followers for the user who posted the story
        const user = await usersCollection.findOne({
          _id: new ObjectId(userId),
        });
        const followers = user.following || [];

        // Create a notification for each follower
        for (const followerId of followers) {
          await notificationCollection.insertOne({
            userId: followerId,
            senderName: user.name,
            senderPicture: user.picture,
            senderId: userId,
            message: `${articleTitle}`,
            timestamp: new Date(),
            type: "Story",
            read: false,
          });
          const userUID = user._id.valueOf();
          // Emit the new notification to the follower's socket connection
          io.to(`user:${followerId}`).emit("new_notification", {
            userId: followerId,
            senderName: user.name,
            senderPicture: user.picture,
            senderId: userId,
            message: `${articleTitle}`,
            timestamp: new Date(),
            type: "Story",
            read: false,
          });
        }

        res.send(story);
      } catch (error) {
        console.error(error);
        res.status(500).send("Error creating story");
      }
    });

    // Payment route
    app.get("/payment-user/:id", async (req, res) => {
      const { id } = req.params;

      const user = await paymentCollection.findOne({ transactionId: id });
      res.send(user);
    });

    app.post("/payment/fail", async (req, res) => {
      const { transactionId } = req.query;
      if (!transactionId) {
        return res.redirect(`${process.env.CLIENT_URL}/fail`);
      }
      const result = await paymentCollection.deleteOne({ transactionId });
      if (result.deletedCount) {
        res.redirect(`${process.env.CLIENT_URL}/fail`);
      }
    });

    // get specific user by user email
    app.get("/user/:userId", async (req, res) => {
      const email = req.params.userId;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.json(user);
    });

    /*=================
    User follow section
    ==================*/

    app.post("/users/follow", (req, res) => {
      const userId = req.body.userId;
      const followingId = req.body.followingId;
      usersCollection.updateOne(
        { _id: ObjectId(userId) },
        { $addToSet: { following: followingId } },
        (error, result) => {
          if (error) {
            res.status(500).send({ error: "Error updating user" });
          } else {
            res.status(200).send({ message: "Successfully followed user" });
          }
        }
      );
    });

    app.post("/users/unfollow", (req, res) => {
      const userId = req.body.userId;
      const unfollowingId = req.body.unfollowingId;
      usersCollection.updateOne(
        { _id: ObjectId(userId) },
        { $pull: { following: unfollowingId } },
        (error, result) => {
          if (error) {
            res.status(500).send({ error: "Error updating user" });
          } else {
            res.status(200).send({ message: "Successfully unfollowed user" });
          }
        }
      );
    });

    app.get("/users/:userId/following/:followingId", (req, res) => {
      const userId = req.params.userId;
      const followingId = req.params.followingId;

      usersCollection.findOne(
        { _id: ObjectId(userId), following: followingId },
        (error, result) => {
          if (error) {
            res.status(500).send({ error: "Error fetching user" });
          } else {
            if (result) {
              res.status(200).send({ isFollowing: true });
            } else {
              res.status(200).send({ isFollowing: false });
            }
          }
        }
      );
    });

    // Search route
    // app.get("/search", async (req, res) => {
    //   try {
    //     const query = req.query.q;
    //     const results = await articleCollection
    //       .find({ $text: { $search: query } })
    //       .toArray();
    //     res.json(results);
    //   } catch (err) {
    //     res.status(500).json({ message: err.message });
    //   }
    // });

    app.get("/search/:query", async (req, res) => {
      const query = req.params.query;
      const regex = new RegExp(query, "i");
      const suggestions = await articleCollection
        .find({ articleTitle: { $regex: regex } }, { articleTitle: 1 })
        .limit(5)
        .toArray();
      const articles = await articleCollection
        .find({ $text: { $search: query } })
        .toArray();
      res.json({ articles, suggestions });
    });

    // Search articles by title
    // app.get("/search", (req, res) => {
    //   const query = req.query.q.toLowerCase();
    //   const results = articleCollection.filter((article) =>
    //     article.articleTitle.toLowerCase().includes(query)
    //   );
    //   res.json({ results });
    // });

    // Payment gateway sslcommerz setup
    app.post("/payment", async (req, res) => {
      const paymentUser = req.body;
      const transactionId = new ObjectId().toString();
      const data = {
        total_amount: paymentUser.price,
        currency: "BDT",
        tran_id: transactionId,
        success_url: `${process.env.SERVER_URL}/payment/success?transactionId=${transactionId}`,
        fail_url: `${process.env.SERVER_URL}/payment/fail?transactionId=${transactionId}`,
        cancel_url: `${process.env.SERVER_URL}/payment/fail?transactionId=${transactionId}`,
        ipn_url: "http://localhost:3030/ipn",
        shipping_method: "Courier",
        product_name: "Computer.",
        product_category: "Electronic",
        product_profile: "general",
        cus_name: paymentUser.name,
        cus_email: paymentUser.email,
        cus_add1: "Dhaka",
        cus_add2: "Dhaka",
        cus_city: "Dhaka",
        cus_state: "Dhaka",
        cus_postcode: "1000",
        cus_country: "Bangladesh",
        cus_phone: paymentUser.phone,
        cus_fax: "01711111111",
        ship_name: "Customer Name",
        ship_add1: "Dhaka",
        ship_add2: "Dhaka",
        ship_city: "Dhaka",
        ship_state: "Dhaka",
        ship_postcode: 1000,
        ship_country: "Bangladesh",
      };

      const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
      sslcz.init(data).then((apiResponse) => {
        // Redirect the user to payment gateway
        let GatewayPageURL = apiResponse.GatewayPageURL;
        paymentCollection.insertOne({
          name: paymentUser.name,
          email: paymentUser.email,
          phone: paymentUser.phone,
          amount: paymentUser.price,
          transactionId,
          paid: false,
        });
        res.send({ url: GatewayPageURL });
      });
      // res.send(data)
    });
    app.post("/payment/success", async (req, res) => {
      const { transactionId } = req.query;
      if (!transactionId) {
        return res.redirect(`${process.env.CLIENT_URL}/fail`);
      }
      const result = await paymentCollection.updateOne(
        { transactionId },
        { $set: { paid: true, paidTime: new Date() } }
      );
      const paidUser = await paymentCollection.findOne({ transactionId });
      //
      const PaidUserEmail = paidUser.email;
      const userPaid = await usersCollection.updateOne(
        { email: PaidUserEmail },
        { $set: { isPaid: true, paidTime: new Date() } }
      );

      sendPaymentEmail(PaidUserEmail, paidUser);

      if (result.modifiedCount > 0) {
        res.redirect(
          `${process.env.CLIENT_URL}/success?transactionId=${transactionId}`
        );
      }
    });

    app.post("/payment/cancel", async (req, res) => {
      return res.redirect(`${process.env.CLIENT_URL}/fail`);
    });

    // Create a new notification
    const createNotification = (
      userId,
      senderId,
      senderName,
      senderImage,
      message,
      type
    ) => {
      const newNotification = {
        userId: userId,
        senderName: senderName,
        senderPicture: senderImage,
        senderId: senderId,
        message: message,
        type: type,
        timestamp: new Date(),
        read: false,
      };
      // console.log(senderImage);
      notificationCollection.insertOne(newNotification, (err, result) => {
        if (err) {
          console.error("Error creating notification:", err);
        } else {
          // Emit the new notification to the user's socket
          io.to(userId).emit("new_notification", result);
        }
      });
    };
    // Get all notifications for the user
    // app.get("/notifications/:userId", (req, res) => {
    //   const userId = req.params.userId;
    //   notificationCollection
    //     .find({ userId: userId })
    //     .sort({ timestamp: -1 })
    //     .toArray((err, docs) => {
    //       if (err) {
    //         res.status(500).send("Error retrieving notifications");
    //       } else {
    //         res.send(docs);
    //       }
    //     });
    // });

    app.get("/notifications/:userId", (req, res) => {
      const userId = req.params.userId;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 5;
      const skip = (page - 1) * limit;

      notificationCollection
        .find({ userId: userId })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .toArray((err, docs) => {
          if (err) {
            res.status(500).send("Error retrieving notifications");
          } else {
            res.send(docs);
          }
        });
    });

    // Create a new notification
    app.post("/notifications", (req, res) => {
      const newNotification = {
        message: req.body.message,
        timestamp: new Date(),
        read: false,
      };

      notificationCollection.insertOne(newNotification, (err, result) => {
        if (err) {
          res.status(500).send("Error creating notification");
        } else {
          // Emit the new notification to all clients
          io.emit("new_notification", result.ops[0]);
          res.send(result.ops[0]);
        }
      });
    });

    // Update a notification as read
    app.put("/notifications/:id", (req, res) => {
      const id = req.params.id;

      notificationCollection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { read: true } },
        (err, result) => {
          if (err) {
            res.status(500).send("Error updating notification");
          } else {
            // Emit the updated notification to all clients
            io.emit("notification_updated", result.value);
            res.send(result);
          }
        }
      );
    });

    /*===================
    subscribe writter
    =====================*/
    app.post("/users/subscrib", (req, res) => {
      const userId = req.body.userId;

      const subscribId = req.body.subscribId;

      usersCollection.updateOne(
        { _id: ObjectId(userId) },
        { $addToSet: { subscrib: subscribId } },
        (error, result) => {
          if (error) {
            res.status(500).send({ error: "Error updating user" });
          } else {
            res.status(200).send({ message: "Successfully subscrib user" });
          }
        }
      );
    });

    app.post("/users/unsubscrib", (req, res) => {
      const userId = req.body.userId;
      const unsubscribId = req.body.unsubscribId;
      usersCollection.updateOne(
        { _id: ObjectId(userId) },
        { $pull: { subscrib: unsubscribId } },
        (error, result) => {
          if (error) {
            res.status(500).send({ error: "Error updating user" });
          } else {
            res.status(200).send({ message: "Successfully unsubscrib user" });
          }
        }
      );
    });

    app.get("/users/:userId/subscrib/:subscribId", (req, res) => {
      const userId = req.params.userId;
      const subscribId = req.params.subscribId;
      usersCollection.findOne(
        { _id: ObjectId(userId), subscrib: subscribId },
        (error, result) => {
          if (error) {
            res.status(500).send({ error: "Error fetching user" });
          } else {
            if (result) {
              res.status(200).send({ isSubscrib: true });
            } else {
              res.status(200).send({ isSubscrib: false });
            }
          }
        }
      );
    });

    // User comment  on article  post to the database
    app.post("/comments", async (req, res) => {
      const comments = req.body;
      const result = await commentCollection.insertOne(comments);
      res.send(result);
    });

    // reply comment data to db
    app.post("/replyComment/:id", async (req, res) => {
      const id = req.params.id;
      const replyData = req.body;

      commentCollection.updateOne(
        { _id: ObjectId(id) },
        { $addToSet: { replyComment: replyData } },
        (error, result) => {
          if (error) {
            res.status(500).send({ error: "Error reply user" });
          } else {
            res.status(200).send({ message: "Successfully reply to user" });
          }
        }
      );
    });

    // update Comment

    // app.put("/comment/:id", async (req, res) => {
    //   const id = req.params.id;
    //   // const query={_id:ObjectId(id)}

    //   const updatedComment = req.body.updatedComment;
    //
    //   const filter = { _id: ObjectId(id) };
    //   const options = { upsert: true };
    //   const updatedDoc = {
    //     $set: {
    //       comment: updatedComment,
    //     },
    //   };
    //
    //   const result = await commentCollection.updateOne(
    //     filter,
    //     updatedDoc,
    //     options
    //   );
    //   res.send(result);
    // });

    // app.post("/users/decUpVote", (req, res) => {
    //   const storyId = req.body.storyId;
    //   const decUpVoteId = req.body.decUpVoteId;
    //   articleCollection.updateOne(
    //     { _id: ObjectId(storyId) },
    //     { $pull: { upVote: decUpVoteId } },
    //     (error, result) => {
    //       if (error) {
    //         res.status(500).send({ error: "Error updating user" });
    //       } else {
    //         res.status(200).send({ message: "Successfully decUpVoteing user" });
    //       }
    //     }
    //   );
    // });

    // User comment  on article get from the database

    app.get("/comments", async (req, res) => {
      let query = {};
      if (req.query.articleId) {
        query = {
          articleId: req.query.articleId,
        };
      }
      const cursor = commentCollection.find(query).sort({ _id: -1 });
      const comments = await cursor.toArray();
      res.send(comments);
    });

    // delete comment
    app.delete("/comment/deleteComment/:id", async (req, res) => {
      const id = req.params.id;
      //
      const filter = { _id: ObjectId(id) };
      const result = await commentCollection.deleteOne(filter);

      res.send(result);
    });

    /*=================
    reported story api
    ==================*/
    app.put("/story/reportedStory/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          report: "true",
        },
      };
      const result = await articleCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });
    // get all reportedItems

    app.get("/reportedItem", async (req, res) => {
      const query = { report: "true" };
      const reportedItems = await articleCollection.find(query).toArray();
      res.send(reportedItems);
    });

    // delete reported itme
    app.delete("/Story/reportedStory/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await articleCollection.deleteOne(filter);
      res.send(result);
    });

    // Get UpVote story
    app.get("/vote-story/:id", async (req, res) => {
      const id = req.params.id;
      const storyId = { _id: ObjectId(id) };
      const query = { storyId };
      const story = articleCollection.findOne(query);
      res.json(story);
    });

    // Get Premium or Free Story Details API
    app.get("/view-story/:id", async (req, res) => {
      const id = req.params.id;
      const storyId = { _id: ObjectId(id) };
      const userId = req.headers["user-id"];
      const visitorId = req.headers["visitor-id"];
      const visitorMacAddress = req.headers["visitor-mac-address"];

      // function to check if visitor has reached their monthly limit
      const checkMonthlyLimit = async () => {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const count = await viewsCollection.countDocuments({
          visitorId,
          visitorMacAddress,
          viewedAt: { $gte: oneMonthAgo },
        });
        return count >= 1;
      };

      // function to add a view to the "views" collection
      const addView = async () => {
        const view = {
          visitorId,
          visitorMacAddress,
          storyId,
          viewedAt: new Date(),
        };
        return viewsCollection.insertOne(view);
      };

      // get the story
      const story = await articleCollection.findOne(storyId);

      // check if user is logged in
      if (story.isPaid && !userId) {
        // check if visitor has already viewed this story
        const existingView = await viewsCollection.findOne({
          visitorId,
          visitorMacAddress,
          storyId,
        });
        if (existingView) {
          // visitor has already viewed this story, return the story
          return res.json(story);
        }
        // check if visitor has reached their monthly limit
        if (await checkMonthlyLimit()) {
          return res.status(429).json({
            error: "You have reached your monthly view limit.",
          });
        }
        // add the view to the "views" collection
        await addView();
        return res.json(story);
      }

      // user is logged in
      const user = await usersCollection.findOne({ _id: ObjectId(userId) });
      if (story.isPaid && user.isPaid) {
        return res.json(story);
      } else if (story.userId === userId) {
        return res.send(story);
      } else if (story.isPaid && userId) {
        // check if visitor has already viewed this story
        const existingView = await viewsCollection.findOne({
          visitorId,
          visitorMacAddress,
          storyId,
        });
        if (existingView) {
          // visitor has already viewed this story, return the story
          return res.json(story);
        }
        // check if visitor has reached their monthly limit
        if (await checkMonthlyLimit()) {
          return res.status(429).json({
            error: "You have reached your monthly view limit.",
          });
        }
        // add the view to the "views" collection
        await addView();
        return res.json(story);
      } else {
        res.send(story);
      }
    });
    // Get Premium or Free Story Details API End

    // Save Articles API
    app.post("/save-article", async (req, res) => {
      const save = req.body;
      const result = await saveArticleCollection.insertOne(save);
      res.send(result);
    });
    app.get("/save-article", async (req, res) => {
      const query = {};
      const result = await saveArticleCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/count/:user", async (req, res) => {
      const count = await articleCollection.countDocuments({
        user: req.params.userEmail,
      });
      res.send({ count });
    });
    app.delete("/save-article/delete-article/:id", async (req, res) => {
      const id = req.params.id;

      const filter = { _id: id };
      const result = await saveArticleCollection.deleteOne(filter);
      res.send(result);
    });

    // Save Articles API End

    // ChatGPT API
    app.post("/hexa-ai", async (req, res) => {
      // Get the prompt from the request
      const { prompt, userEmail } = req.body;

      // Generate a response with ChatGPT
      const completion = await openai.createCompletion({
        model: "text-davinci-003",
        prompt: prompt,
        temperature: 0,
        max_tokens: 3000,
        frequency_penalty: 0.5,
        top_p: 1, // alternative to sampling with temperature, called nucleus sampling
        frequency_penalty: 0.5, // Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim.
        presence_penalty: 0,
      });

      await apiAnsCollection.insertOne({
        email: userEmail,
        question: prompt,
        answer: completion.data.choices[0].text,
      });
      //
      res.send(completion.data.choices[0].text);

      // try {
      //   const prompt = req.body.prompt;
      //
      //   const response = await openai.createCompletion({
      //     model: "text-davinci-003",
      //     prompt: `${prompt}`,
      //     temperature: 0, // Higher values means the model will take more risks.
      //     max_tokens: 3000, // The maximum number of tokens to generate in the completion. Most models have a context length of 2048 tokens (except for the newest models, which support 4096).
      //     top_p: 1, // alternative to sampling with temperature, called nucleus sampling
      //     frequency_penalty: 0.5, // Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim.
      //     presence_penalty: 0, // Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics.
      //   });

      //   res.status(200).send({
      //     bot: response.data.choices[0].text,
      //   });
      // } catch (error) {
      //   console.error(error);
      //   res.status(500).send(error || "Something went wrong");
      // }
    });

    app.get("/apiAns", async (req, res) => {
      const email = req.query.email;

      const allApiAns = await apiAnsCollection.find({ email }).toArray();
      res.send(allApiAns);
    });

    app.get("/hexa-ai/:id", async (req, res) => {
      const id = req.params.id;
      const historyId = { _id: ObjectId(id) };
      const historyAns = await apiAnsCollection.findOne(historyId);
      res.send(historyAns);
    });

    // ChatGPT API End

    /*=================
    messaging api
    =================== */

    const getLastMassage = async (myId, frndId) => {
      // console.log(myId,frndId)
      const lastMessage = await messagesCollection.findOne({
        $or: [
          {
            $and: [{ senderId: { $eq: myId } }, { reciverId: { $eq: frndId } }],
          },
          {
            $and: [{ reciverId: { $eq: myId } }, { senderId: { $eq: frndId } }],
          },
        ],
      });
      return lastMessage;
    };

    // get friend data .sort({ date: -1 }) { sort: { date: -1 } } .sort({date:-1}).limit(1);
    app.get("/friends", async (req, res) => {
      const myId = req.query.myId;
      let friendMessage = [];
      const getFriend = await usersCollection
        .find({
          _id: { $ne: myId },
        })
        .toArray();

      for (let i = 0; i < getFriend.length; i++) {
        let friendId = getFriend[i]._id;
        frindObjectIdString = friendId.toString();
        let lastMsg = await getLastMassage(myId, frindObjectIdString);
        // console.log(lastMsg)
        friendMessage = [
          ...friendMessage,
          { frindInfo: getFriend[i], messgInfo: lastMsg },
        ];
        // console.log(friendMessage)
      }

      res.send(friendMessage);
    });

    // send message
    app.post("/sendMessage", async (req, res) => {
      const message = req.body.data;

      const result = await messagesCollection.insertOne(message);
      createNotification(
        message.reciverId,
        message.senderId,
        message.senderName,
        message.senderImage,
        message.message.text,
        "Message"
      );
      // console.log(message.senderImage);
      res.send(result);
    });

    // get message
    app.get("/sendMessage/:id/getMseeage/:myId", async (req, res) => {
      const frndId = req.params.id;
      const myId = req.params.myId;
      const result = await messagesCollection
        .find({
          $or: [
            {
              $and: [
                { senderId: { $eq: myId } },
                { reciverId: { $eq: frndId } },
              ],
            },
            {
              $and: [
                { reciverId: { $eq: myId } },
                { senderId: { $eq: frndId } },
              ],
            },
          ],
        })
        .sort({ date: 1 })
        .toArray();

      // const filter = result.filter(m=>m.senderId===myId && m.reciverId===frndId || m.reciverId===myId && m.senderId===frndId)
      res.send(result);
    });
    // send image
    app.post("/send-image", async (req, res) => {
      const imgMessage = req.body.data;
      const result = await messagesCollection.insertOne(imgMessage);
      res.send(result);
    });

    // Create endpoint for getting all conversations
    app.get("/conversations", async (req, res) => {
      // Find all conversations
      const allConversations = await messagesCollection.find({}).toArray();

      // Return the conversations
      res.json(allConversations);
    });

    // Create endpoint for getting all messages in a conversation
    app.get("/conversations/:id", async (req, res) => {
      // Connect to the MongoDB database
      // Find the conversation by its ID
      const conversation = await messagesCollection.findOne({
        _id: ObjectId(req.params.id),
      });

      // Return the messages in the conversation
      res.json(conversation.messages);
    });

    // Create endpoint for creating a new conversation
    app.post("/conversations", async (req, res) => {
      // Insert a new conversation
      const newConversation = {
        participants: [req.body.senderId, req.body.receiverId],
        messages: [],
        timestamp: new Date(),
      };
      const result = await messagesCollection.insertOne(newConversation);

      // Return the ID of the new conversation
      res.json({ id: result.insertedId });
    });

    // Endpoint to import story
    app.post("/import-story", async (req, res) => {
      try {
        const { url, extra } = req.body;

        const {
          userId,
          userEmail,
          writerName,
          writerImg,
          articleRead,
          category,
        } = extra;
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const articleTitle = sanitizeHtml($("h1").text());
        const articleImg = sanitizeHtml(
          $("meta[property='og:image']").attr("content")
        );
        const articleDetails = $("section").text();
        // const cleanContent = articleDetails.replace(
        //   /document\.domain\s*=\s*document\.domain;\s*Open in appSign upSign InWriteSign upSign InPublished inJavaScript in Plain EnglishCan DurmusFollowJul \d{1,2}, \d{4}·\d+ min read·Member-onlySave/g,
        //   ""
        // );

        // const articleTitle = sanitizeHtml($("h1").text());
        // const articleImg = sanitizeHtml(
        //   $("meta[property='og:image']").attr("content")
        // );
        // const articleDetails = sanitizeHtml($("body").text());
        await articleCollection.insertOne({
          articleDetails,
          userId,
          userEmail,
          writerName,
          writerImg,
          articleTitle,
          timestamp: new Date(),
          articleRead,
          articleImg,
          category,
        });
        res.status(200).send({ message: "Story imported successfully" });
      } catch (error) {
        res.status(500).send({ message: "Failed to import story" });
      }
    });

    // Get all stories for a specific user
    app.get("/my-stories", async (req, res) => {
      const email = req.query.email;
      let query = { userEmail: email };
      const articles = await articleCollection
        .find(query)
        .sort({ timestamp: -1 })
        .toArray();
      res.send(articles);
    });

    // Get all stories for a specific user
    app.get("/my-stories-3", async (req, res) => {
      const email = req.query.email;
      let query = { userEmail: email };
      const articles = await articleCollection.find(query).limit(3).toArray();
      res.send(articles);
    });

    // UpVote & DownVote API
    app.post("/upvote-story/:id/upvote", async (req, res) => {
      const vote = req.body.vote;

      if (vote !== "upvote" && vote !== "downvote") {
        res.status(400).json({ error: "Invalid vote type" });
        return;
      }
      const post = await articleCollection.findOne({
        _id: ObjectId(req.params.id),
      });

      if (!post) {
        res.status(404).json({ error: "Post not found" });
        return;
      }
      const update = {};
      if (vote === "upvote") {
        update.$inc = { upvotes: 1 };
        if (post.downvotes > 0) {
          update.$inc.downvotes = -1;
        }
      } else if (vote === "downvote") {
        update.$inc = { downvotes: 1 };
        if (post.upvotes > 0) {
          update.$inc.upvotes = -1;
        }
      }
      const updatedPost = await articleCollection.findOneAndUpdate(
        { _id: ObjectId(req.params.id) },
        update,
        { returnOriginal: false }
      );
      res.json(updatedPost.value);
    });

    app.post("/downvote-story/:id/downvote", async (req, res) => {
      const { id } = req.params;
      const storyId = { _id: ObjectId(id) };
      const { userId } = req.body;
      try {
        const id = req.params.id;
        const db = client.db();
        const post = await articleCollection.findOneAndUpdate(
          { _id: ObjectId(id) },
          { $inc: { downvotes: 1 } },
          { returnOriginal: false }
        );
        res.json(post);
      } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
      }
    });
    // UpVote & DownVote API End
  } finally {
  }
}
//
run().catch((err) => console.error(err));

httpServer.listen(port, () => {
  console.log(`FreeMium Server is Running on Port ${port}`);
});
