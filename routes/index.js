const express = require('express');
const router = express.Router();
const {VisaNet} = require('@arturoblack/visanet');

const settings = require("../config/settings.json").visanet;

const storeData = require("../config/settings.json").store;

const url = require("../config/settings.json").url;

const axios = require("axios");

const visa = new VisaNet({
  user: settings.user, //'integraciones.visanet@necomplus.com',
  password: settings.password, //'d5e7nk$M',
  merchantId: settings.merchantId, //'522591303',
  env: settings.env //'dev',
});

Number.prototype.padLeft = function(base,chr){
  var  len = (String(base || 10).length - String(this).length)+1;
  return len > 0? new Array(len).join(chr || '0')+this : this;
}

router.get('/pagar', async function(req, res, next) {
  let {amount, product, reservaId, email, name, lastName } = req.query;
  const clientIp = req.ip; 


  const domain = `${req.protocol}://${req.hostname}`; 

  let logo = storeData.logo;

  try {
    const securityToken = await visa.createToken();
    const body = { 
      amount, 
      channel: visa.channel, 
      antifraud: 
        { 
          clientIp, 
          merchantDefineData: { 
            MDD1: 'web', MDD2: 'Canl', MDD3: 'Canl', 
            MDD4: email, MDD21: 0, MDD32: email, MDD75: 'REGISTRADO', MDD77: 7 },
        }
    };
    const {
      sessionKey,
      expirationTime
    } = await visa.createSession(securityToken, body);

    let purchaseNumber = Math.floor(Math.random() * 1000000);
    req.session.visa = {securityToken, sessionKey, amount, product, purchaseNumber, reservaId};
    res.render('pagar', {
      sessionKey,
      expirationTime,
      merchantId: visa.merchantId,
      amount,
      product,
      email,
      name,
      lastName,
      logo,
      domain,
      purchaseNumber,
    });
  } catch(error) {
    res.status(500).json(error);
  }
});

router.post('/visa/respuesta', async function(req, res, next) {
    const {
      transactionToken,
      customerEmail,
      channel,
    } = req.body;

    const {
      securityToken, 
      sessionKey, 
      reservaId,
      amount, 
      product,
      purchaseNumber,
    } = req.session.visa;

    const body = {
      antifraud: null,
      captureType: 'manual',
      channel,
      countable: true,
      order: {
        amount:  amount,
        currency: visa.currency,
        purchaseNumber,
        tokenId: transactionToken
      },
    };


  try {

    const payload = await visa.getAuthorization(securityToken, body);
    var d = new Date(payload.header.ecoreTransactionDate),
    dformat = [(d.getMonth()+1).padLeft(),
               d.getDate().padLeft(),
               d.getFullYear()].join('/') +' ' +
              [d.getHours().padLeft(),
               d.getMinutes().padLeft(),
               d.getSeconds().padLeft()].join(':');
    payload.header.ecoreTransactionDate = dformat;

    if ( payload.dataMap.STATUS === 'Authorized' ) {
      console.log("FUE EXISOTOS!!")

      let data = {
        reservaId
      }

      // AQUI Hacemos una llamda HTTP a Meteor para gestionar los inventarios del vendedores y del comprador
      axios({
        method: 'post',
        url,
        data,
      })
      .then(response => {
          console.log(response.data);
      })        
      .catch(error => {
          console.log("ERROR: ", error);
      });
    }

    res.render('complete', {payload, product, storeData });


  } catch (error) {
    console.log("ERROR: ", error)

    res.render('error', { amount, product, storeData });

  }

});

module.exports = router;
