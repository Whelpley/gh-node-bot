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

            // echoes back everything sent
            // keep in development stage to confirm functionality of response
            sendTextMessage(sender, "Text received, echo: " + text.substring(0, 200));

            // search Questions, if found return Question cards, if not return Company cards
            requestQuestionCards(sender, text);

            //search for Companies and send out info cards for each
            // requestCompanyCards(sender, text);

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

function requestQuestionCards(sender, text) {
    let questions = [];
    let companyIDs = [];
    let guideIDs = [];
    let companyObjects = [];
    let companyTable = {};
    let guideObjects = [];
    let guideTable = {};

    let filters = {
        type: 'question',
        isGuide: true
    };
    let limit = 5;
    request('https://api.gethuman.co/v3/posts/search?match='
            + encodeURIComponent(text)
            + '&limit='
            + limit
            + '&filterBy='
            + encodeURIComponent(JSON.stringify(filters))
            , function (error, response, body) {
        if (!error && response.statusCode == 200) {
            // load response object into questions array
            questions = JSON.parse(body);
            if (questions && questions.length) {
                let responseText = "We found " + questions.length + " relevant questions to your input.";
                sendTextMessage(sender, responseText);
                console.log("All questions returned from API: " + questions);

                for (let i = 0; i < questions.length; i++) {
                    companyIDs.push(questions[i].companyId);
                    guideIDs.push(questions[i].guideId);
                };
                console.log("Company ID's: " + companyIDs);
                console.log("Guide ID's: " + guideIDs);

                // make hash table of companyID: company Objects
                request('https://api.gethuman.co/v3/companies?where='
                    + encodeURIComponent(JSON.stringify({ _id: { $in: companyIDs }}))
                    , function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        companyObjects = JSON.parse(body);
                        responseText = "We found " + companyObjects.length + " companies matching your questions.";
                        sendTextMessage(sender, responseText);
                        //make the hash table
                        for (let i = 0; i < companyObjects.length; i++) {
                            companyTable[companyObjects[i]._id] = companyObjects[i]
                        };
                        console.log("All company Objects returned from API: " + JSON.stringify(companyTable));

                    } else if (error) {
                    console.log(error);
                  }
                });

                // make hash table of guideID: guide Objects
                request('https://api.gethuman.co/v3/guides?where='
                    + encodeURIComponent(JSON.stringify({ _id: { $in: guideIDs }}))
                    , function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        guideObjects = JSON.parse(body);
                        responseText = "We found " + guideObjects.length + " guides matching your questions.";
                        sendTextMessage(sender, responseText);
                        //make the hash table
                        for (let i = 0; i < guideObjects.length; i++) {
                            guideTable[guideObjects[i]._id] = guideObjects[i]
                        };
                        console.log("All guide Objects returned from API: " + JSON.stringify(guideTable));
                    } else if (error) {
                    console.log(error);
                  }
                });

                // attach Companies and Guides to Questions
                for (var i = 0; i < questions.length; i++) {
                    let cID = questions[i].companyId;
                    questions[i].company = companyTable.cID;
                    let gID = questions[i].guideId;
                    questions[i].guide = guideTable.gID;
                };
                // Make cards out of massive data hash
                // (room for optimization later! too much data being shuffled around!)
                sendAllQuestionCards(sender, questions);

            } else {
                let responseText = "We could not find a matching question to your input, displaying relevant companies instead:";
                sendTextMessage(sender, responseText);
                requestCompanyCards(sender, text);
            };

        } else if (error) {
            console.log(error);
        }
    })
};

function requestCompanyCards(sender, text) {
    let companies = [];

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
};

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

function sendAllQuestionCards(sender, questions) {
    console.log("All the question cards will be sent at this step.");
    let allElements = [];
    // iterate over Questions, make single cards, push into allElements
    for (let i = 0; i < questions.length; i++) {
        let companyName = questions[i].companyName || '';
        let urlId = questions[i].urlId || '';
        let phone = questions[i].phone || '';
        //format phone# for international format
        let phoneIntl = (phone) ? phoneFormatter.format(phone, "+1NNNNNNNNNN") : '';
        let title = questions[i].title || '';
        // check if company name is in title already, add to front if not
        if (title.indexof(companyName) < 0) {
            title = companyName + ": " + title;
        };
        // truncate title
        title = title.substring(0,79);
        // dummy text for solutions for now
        solutions = "Hit it with a hammer until it works better. Does it work yet? Good. You did real good, kid. You're a winner. Really. Now go home to your mother.";
        solutions = solutions.substring(0,79);

        let singleElement = {
            "title": title,
            "subtitle": solutions,
            "buttons": [{
                "type": "web_url",
                "url": "https://answers.gethuman.co/_" + encodeURIComponent(urlId) ,
                "title": "More Info"
            }, {
                "type": "web_url",
                "url": "https://gethuman.com?company=" + encodeURIComponent(companyName) ,
                "title": "Solve - $20"
            }],
        };
        // if there is a valid phone # (needs stricter checks), add Call button
        if (phoneIntl) {
            singleElement.buttons.unshift({
                "type": "phone_number",
                "title": "Call " + companyName,
                "payload": phoneIntl
            })
        };
        allElements.push(singleElement);
    };
    // send it on!
    // collapse this into a re-usable function (find duplicates)
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
    });

};

function sendAllCompanyCards(sender, companies) {

    let allElements = [];
    // iterate over companies, make single cards, push into allElements
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
    // collapse this into a re-usable function (find duplicates)
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