'use strict'

const express = require('express')
const bodyParser = require('body-parser')
const request = require('request')
const app = express()
const phoneFormatter = require('phone-formatter');

// const companyInfo = require('./companyinfo.js');

const token = process.env.FB_PAGE_ACCESS_TOKEN
const GH_token = process.env.GH_API_ACCESS_TOKEN

app.set('port', (process.env.PORT || 5000))

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: false}))

// Process application/json
app.use(bodyParser.json())

// Index route
app.get('/', function (req, res) {
    res.send('Hello world, I am a chat bot')
})

// for Facebook verification
app.get('/webhook/', function (req, res) {
    if (req.query['hub.verify_token'] === 'my_voice_is_my_password_verify_me') {
        res.send(req.query['hub.challenge'])
    }
    res.send('Error, wrong token')
})

app.post('/webhook/', function (req, res) {

    //where all responses to text inputs are handled
    let messaging_events = req.body.entry[0].messaging
    for (let i = 0; i < messaging_events.length; i++) {
        let event = req.body.entry[0].messaging[i]
        let sender = event.sender.id

        // handling text input
        if (event.message && event.message.text) {
            let text = event.message.text;
            let companies = [];
            // echoes back everything sent
            // keep in development stage to confirm functionality of response
            sendTextMessage(sender, "Text received, echo: " + text.substring(0, 200));

            //punch up GH API (company search only) with user text input
            request('https://api.gethuman.co/v3/companies/search?limit=5&match=' + encodeURIComponent(text), function (error, response, body) {
              if (!error && response.statusCode == 200) {
                let parsedBody = JSON.parse(body);
                // console.log("Full API response: " + parsedBody);
                // iterate over API response, construct company object
                for (let i=0; i < parsedBody.length; i++) {
                    let newName = parsedBody[i].name || '';
                    let newPhone = parsedBody[i].callback.phone || '';
                    let newEmail = '';
                    // filter GH array to find contactInfo
                    let emailContactMethods = parsedBody[i].contactMethods.filter(function ( method ) {
                        return method.type === "email";
                    });
                    if (emailContactMethods && emailContactMethods.length) {
                        // console.log("Email Object found: " + JSON.stringify(emailContactMethods));
                        newEmail = emailContactMethods[0].target;
                    };
                    // console.log("Harvested an email: " + newEmail);
                    let newCompany = new Company(newName, newPhone, newEmail);
                    // push object into Companies array
                    // console.log("Company # " + i + ": " + newName + ": " + newCompany);
                    companies.push(newCompany);
                };
                // console.log("Formatted companies array: " + companies);
                sendAllCompanyCards(sender, companies);
              } else if (error) {
                console.log(error);
              }
            })
          // // bounces back Generic template cards
          // if (text === 'Generic') {
          //     sendGenericMessage(sender)
          //     continue
          // }
        }

        // handling postback buttons
        if (event.postback) {
          // test message verify button - echoes postback payload
          let text = JSON.stringify(event.postback);
          sendTextMessage(sender, "Postback received: "+text.substring(0, 200), token);

          let payloadText = event.postback.payload;
          sendDummyCard(sender, payloadText);
          continue
        }
    }

    res.sendStatus(200)
})

function sendDummyCard(sender, payloadText) {
    let allElements = [];
    let singleElement = {
        "title": "Dummy Card!",
        // what to display if no email or phone available?
        "subtitle": "This will show a solution for " + payloadText,
        // "buttons": [{
        //     "type": "postback",
        //     "title": "Guides",
        //     "payload": "Payload for second element in a generic bubble",
        // }, {
        //     "type": "web_url",
        //     "url": "https://gethuman.com?company=" + encodeURIComponent(name) ,
        //     "title": "Solve - $20"
        // }],
    };
    allElements.push(singleElement);
    let messageData = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": allElements
            }
        }
    };
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:sender},
            message: messageData,
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }
    })
};

function sendAllCompanyCards(sender, companies) {

    let allElements = [];
    // iterate over companies, make single cards, push into allElements
    // for better performance, pare down companies to most relevant before this step
    for (let i = 0; i < companies.length; i++) {
        let name = companies[i].name || '';
        let email = companies[i].email || '';
        let phone = companies[i].phone || '';
        //format phone# for international format
        let phoneIntl = (phone) ? phoneFormatter.format(phone, "+1NNNNNNNNNN") : '';
        // dummy image for now
        // has to be a valid URL - not local storage
        // let image = "http://findicons.com/files/icons/2198/dark_glass/128/modem2.png"
        let singleElement = {
            "title": name,
            // what to display if no email or phone available?
            "subtitle": email,
            // "image_url": image,
            "buttons": [{
                "type": "postback",
                "title": "Guides",
                "payload": name,
            }, {
                "type": "web_url",
                "url": "https://gethuman.com?company=" + encodeURIComponent(name) ,
                "title": "Solve - $20"
            }],
        };
        // if there is a valid phone # (needs stricter checks), add Call button
        if (phoneIntl) {
            singleElement.subtitle = phone + ",\n" + email,
            singleElement.buttons.unshift({
                "type": "phone_number",
                "title": "Call " + name,
                "payload": phoneIntl
            })
        };
        allElements.push(singleElement);
    };
    // console.log("All of the elements of the cards: " + allElements);
    let messageData = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": allElements
            }
        }
    };
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:sender},
            message: messageData,
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }
    })
}

//sends a basic text message
function sendTextMessage(sender, text) {
    let messageData = { text:text }
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:sender},
            message: messageData,
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }
    })
}

// should this function declaration exist elsewhere?
function Company(name, phone, email) {
  this.name = name;
  this.phone = phone;
  this.email = email
};

// Spin up the server
app.listen(app.get('port'), function() {
    console.log('running on port', app.get('port'))
})