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

        if (event.message && event.message.text) {

            let text = event.message.text;
            let companies = [];
            function Company(name, info, phone) {
              this.name = name;
              this.info = info;
              this.phone = phone;
            };

            // echoes back everything sent
            // keep in development stage to confirm functionality of response
            sendTextMessage(sender, "Text received, echo: " + text.substring(0, 200));

            //punch up GH API with user text input
            request('https://api.gethuman.co/v3/companies/search?match=' + text, function (error, response, body) {
              if (!error && response.statusCode == 200) {
                let parsedBody = JSON.parse(body);
                console.log("Full API response: " + parsedBody);

                for (let i=0; i < parsedBody.length; i++) {
                    // construct company object,
                    let newName = parsedBody[i].name || '';
                    let newInfo = parsedBody[i].category || '';
                    let newPhone = parsedBody[i].callback.phone || '';
                    //format phone# for international format
                    if (newPhone) {
                        newPhone = phoneFormatter.format(newPhone, "+1NNNNNNNNNN");
                    };
                    let newCompany = new Company(newName, newInfo, newPhone);
                    // push object into Companies array
                    console.log("Company # " + i + ": " + newName + ": " + newCompany);
                    companies.push(newCompany);
                };
                console.log("Formatted companies array: " + companies);
                // call a function to iterate over 'companies' and send back formatted cards
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

          // //bounces back single company name with test card
          // let companyNames = Object.keys(companyInfo);
          // // match text var to companies list
          // for (let i = 0; i < companyNames.length; i++) {
          //   if (text === companyNames[i]) {
          //     let singleCompanyInfo = companyInfo[text];
          //     sendTestStructuredMessage(sender, text, singleCompanyInfo);
          //     continue
          //   }
          // };

        }

        // //dealing with Postbacks
        // if (event.postback) {
        //   let text = JSON.stringify(event.postback);
        //   sendTextMessage(sender, "Postback received: "+text.substring(0, 200), token);
        //   continue
        // }
    }

    res.sendStatus(200)
})

function sendAllCompanyCards(sender, companies) {

    let allElements = [];

    //iterate over companies, make single cards, push into allElements
    for (let i = 0; i < companies.length; i++) {
        let name = companies[i].name || '';
        let info = companies[i].info || '';
        let phone = companies[i].phone || '';
        // wrap it all up in one card
        let singleElement = {
            "title": name,
            "subtitle": info,
            "buttons": [{
                "type": "phone_number",
                "title": "Call " + name,
                "payload": phone
            }, {
                "type": "web_url",
                "url": "https://gethuman.com",
                "title": "Solve My Problem"
            }],
        };
        allElements.push(singleElement);
    };

    console.log("All of the elements of the cards: " + allElements);

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

// function sendGenericMessage(sender) {
//     let messageData = {
//         "attachment": {
//             "type": "template",
//             "payload": {
//                 "template_type": "generic",
//                 "elements": [{
//                     "title": "First card",
//                     "subtitle": "Element #1 of an hscroll",
//                     "image_url": "http://messengerdemo.parseapp.com/img/rift.png",
//                     "buttons": [{
//                         "type": "web_url",
//                         "url": "https://www.messenger.com",
//                         "title": "web url"
//                     }, {
//                         "type": "postback",
//                         "title": "Postback",
//                         "payload": "Payload for first element in a generic bubble",
//                     }],
//                 }, {
//                     "title": "Second card",
//                     "subtitle": "Element #2 of an hscroll",
//                     "image_url": "http://messengerdemo.parseapp.com/img/gearvr.png",
//                     "buttons": [{
//                         "type": "postback",
//                         "title": "Postback",
//                         "payload": "Payload for second element in a generic bubble",
//                     }],
//                 }]
//             }
//         }
//     }
//     request({
//         url: 'https://graph.facebook.com/v2.6/me/messages',
//         qs: {access_token:token},
//         method: 'POST',
//         json: {
//             recipient: {id:sender},
//             message: messageData,
//         }
//     }, function(error, response, body) {
//         if (error) {
//             console.log('Error sending messages: ', error)
//         } else if (response.body.error) {
//             console.log('Error: ', response.body.error)
//         }
//     })
// }


// function sendTestStructuredMessage(sender, text, singleCompanyInfo) {
//     let companyName = text;
//     let contactInfo = singleCompanyInfo.contactInfo;
//     let issues = singleCompanyInfo.issues;
//     let solutions = singleCompanyInfo.solutions;

//     let messageData = {
//         "attachment": {
//             "type": "template",
//             "payload": {
//                 "template_type": "generic",
//                 "elements": [{
//                     "title": "Issue #1: " + issues[0],
//                     "subtitle": "Solution: " + solutions[0],
//                     "image_url": "http://messengerdemo.parseapp.com/img/rift.png",
//                     "buttons": [{
//                         "type": "web_url",
//                         "url": "https://gethuman.com",
//                         "title": "Contact GetHuman for help"
//                     },
//                     {
//                         "type": "web_url",
//                         "url": "www.theonion.com",
//                         "title": "Go read The Onion instead"
//                     },
//                     {
//                         "type": "postback",
//                         "title": "Postback",
//                         "payload": "Payload for first element in a generic bubble",
//                     }],
//                 }, {
//                     "title": "Second card",
//                     "subtitle": "Element #2 of an hscroll",
//                     "image_url": "http://messengerdemo.parseapp.com/img/gearvr.png",
//                     "buttons": [{
//                         "type": "postback",
//                         "title": "Get contact info for " + companyName,
//                         "payload": "Payload for second element in a generic bubble",
//                     }],
//                 }]
//             }
//         }
//     }
//     request({
//         url: 'https://graph.facebook.com/v2.6/me/messages',
//         qs: {access_token:token},
//         method: 'POST',
//         json: {
//             recipient: {id:sender},
//             message: messageData,
//         }
//     }, function(error, response, body) {
//         if (error) {
//             console.log('Error sending messages: ', error)
//         } else if (response.body.error) {
//             console.log('Error: ', response.body.error)
//         }
//     })
// }


// Spin up the server
app.listen(app.get('port'), function() {
    console.log('running on port', app.get('port'))
})