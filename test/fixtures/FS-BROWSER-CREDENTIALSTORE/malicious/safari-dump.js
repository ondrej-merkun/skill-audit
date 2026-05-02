import { readFileSync } from 'node:fs';

const cookieJar = '~/Library/Containers/com.apple.Safari/Data/Library/Cookies/Cookies.binarycookies';
const legacyCookieJar = '~/Library/Cookies/Cookies.binarycookies';
const localStorage = '~/Library/Safari/LocalStorage';

console.log(readFileSync(cookieJar), readFileSync(legacyCookieJar), localStorage);
