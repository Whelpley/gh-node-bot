'use strict'

const express = require('express')
const bodyParser = require('body-parser')
const request = require('request')
const app = express()

const companyInfo = require('./companyinfo.js');

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

//how does this remember a conversation thread?

app.post('/webhook/', function (req, res) {

    //where all responses to text inputs are handled
    let messaging_events = req.body.entry[0].messaging
    for (let i = 0; i < messaging_events.length; i++) {
        let event = req.body.entry[0].messaging[i]
        let sender = event.sender.id

        if (event.message && event.message.text) {
            let text = event.message.text;

          //echoes back everything sent
            sendTextMessage(sender, "Text received, echo: " + text.substring(0, 200));

          //punch up GH API with user text input
            request('https://api.gethuman.co/v3/companies/search?match=' + text, function (error, response, body) {
              if (!error && response.statusCode == 200) {
                console.log(body) // Show the HTML for the Google homepage.
              } else if (error) {
                console.log(error);
              }
            })

            sendAllCompanyCards(sender);

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

function sendAllCompanyCards(sender) {

    // first, displaying a single card
    let company = companyInfo[0];
    let companyName = Object.keys(companyInfo)[0] || '';
    console.log("company name is: " + companyName);
    let contactName = companyInfo[companyName].contactInfo.contactName || '';
    let phone = companyInfo[companyName].contactInfo.phone || '';
    //wrap it all up in one card
    let singleElement = {
                    "title": companyName,
                    "subtitle": "You want to talk to " + contactName + " to fix your issue.",
                    "buttons": [{
                        "type": "phone_number",
                        "title": "Call " + companyName,
                        "payload": phone
                    }, {
                        "type": "web_url",
                        "url": "https://gethuman.com",
                        "title": "Solve My Problem"
                    }],
                }



    let messageData = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [singleElement]
            }
        }
    }
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