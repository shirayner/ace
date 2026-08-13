const fs = require('fs');
setTimeout(() => {
  fs.appendFileSync(process.argv[2], '\n// concurrent write\n');
  console.error(`WRITER: appended to ${process.argv[2]}`);
}, 1500);
