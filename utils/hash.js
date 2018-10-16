const bcrypt = require('bcryptjs');
const password = 'password';

bcrypt.hash(password, 10)
    .then(digest => {
        console.log('digest:', digest);
        return digest;
    })
    .then(hash => {
        return bcrypt.compare(password, hash);
    })
    .then(valid => {
        console.log('isValid: ', valid);
    })
    .catch(err => {
        console.error('error', err);
    });
