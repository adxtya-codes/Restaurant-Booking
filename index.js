const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');

const OWNER_NUMBER = '27760538540@c.us';

const userSessions = {};

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true },
    webVersion: '2.3000.1015901620',
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1015901620.html'
    }
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('QR code generated. Scan with WhatsApp.');
});

client.on('ready', () => {
    console.log('WhatsApp bot is ready!');
});

// Prevent unhandled rejections from crashing the process
process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err.message);
});

// Helper: restart session back to name step
async function sendMainMenu(from) {
    userSessions[from] = { step: 'name', data: {} };
    await client.sendMessage(
        from,
        'Welcome to 78onJean Guesthouse!\n\nWe\'re delighted to have you with us and hope your stay is comfortable, relaxing, and truly memorable. Whether you\'re here for business or leisure, our goal is to provide you with warm hospitality and a peaceful home away from home.\n\nPlease enter your name:'
    );
}

client.on('message', async (msg) => {
    if (msg.fromMe) return;

    const from = msg.from;
    const body = msg.body.trim();

    try {

        // No session: only trigger on "book"
        if (!userSessions[from]) {
            if (body.toLowerCase() !== 'breakfast') return;
            await sendMainMenu(from);
            return;
        }

        const session = userSessions[from];

        // Press 0 at any active step -> restart to main menu
        if (body === '0') {
            await sendMainMenu(from);
            return;
        }

        // NAME
        if (session.step === 'name') {
            session.data.name = body;
            session.step = 'room';
            await msg.reply('Please enter your room number:\n\n_Press 0 to return to main menu_');
            return;
        }

        // ROOM
        if (session.step === 'room') {
            session.data.room = body;
            session.step = 'option';

            try {
                const optionsImage = MessageMedia.fromFilePath(
                    path.join(__dirname, 'options.webp')
                );
                await client.sendMessage(from, optionsImage);
            } catch (e) {
                console.error('Could not send options image:', e.message);
            }

            await client.sendMessage(
                from,
                'Please select one of the following three breakfast options:\n\n1. Option 1\n2. Option 2\n3. Option 3\n\n_Press 0 to return to main menu_'
            );
            return;
        }

        // OPTION
        if (session.step === 'option') {
            if (!['1', '2', '3'].includes(body)) {
                await msg.reply('Please enter a valid option (1, 2, or 3):');
                return;
            }
            session.data.option = `Option ${body}`;

            if (body === '3') {
                // Option 3: skip eggs, go straight to side
                session.step = 'side';
                await msg.reply(
                    'Please select your side (Select only 1 side)\n\n1. Hashbrown\n2. Mushroom\n3. Baked Beans\n\n_Press 0 to return to main menu_'
                );
            } else {
                // Option 1 & 2: ask eggs first
                session.step = 'eggs';
                await msg.reply(
                    'How do you like your eggs?\n\n1. Scrambled\n2. Fried\n3. Boiled\n4. Poached\n5. Sunny side up\n\n_Press 0 to return to main menu_'
                );
            }
            return;
        }

        // EGGS
        if (session.step === 'eggs') {
            const eggOptions = {
                '1': 'Scrambled',
                '2': 'Fried',
                '3': 'Boiled',
                '4': 'Poached',
                '5': 'Sunny side up'
            };
            if (!eggOptions[body]) {
                await msg.reply('Please enter a valid option (1-5):');
                return;
            }
            session.data.eggs = eggOptions[body];
            session.step = 'side';
            await msg.reply(
                'Please select your side (Select only 1 side)\n\n1. Hashbrown\n2. Mushroom\n3. Baked Beans\n\n_Press 0 to return to main menu_'
            );
            return;
        }

        // SIDE
        if (session.step === 'side') {
            const sideOptions = {
                '1': 'Hashbrown',
                '2': 'Mushroom',
                '3': 'Baked Beans'
            };
            if (!sideOptions[body]) {
                await msg.reply('Please enter a valid option (1, 2, or 3):');
                return;
            }
            session.data.side = sideOptions[body];
            session.step = 'time';
            await msg.reply(
                'What time would you like to have your breakfast?\n\n1. 6:30 - 7:00\n2. 7:00 - 7:30\n3. 7:30 - 8:00\n4. 8:30 - 9:00\n5. 9:00 - 9:30\n\n_Press 0 to return to main menu_'
            );
            return;
        }

        // TIME
        if (session.step === 'time') {
            const timeOptions = {
                '1': '6:30 - 7:00',
                '2': '7:00 - 7:30',
                '3': '7:30 - 8:00',
                '4': '8:30 - 9:00',
                '5': '9:00 - 9:30'
            };
            if (!timeOptions[body]) {
                await msg.reply('Please enter a valid option (1-5):');
                return;
            }
            session.data.time = timeOptions[body];

            const { name, room, option, eggs, side, time } = session.data;

            // Final confirmation to user
            await msg.reply(
                `Thank you for choosing your delicious breakfast option, ${option}! We're absolutely delighted to host you at ${time} in our breakfast lounge - get ready for a wonderful start to your day filled with great flavors and a warm, welcoming atmosphere. We can't wait to serve you!\n\n_Press 0 to make another booking_`
            );

            // Build order message for owner
            let orderMsg = `New Breakfast Order\n\nName: ${name}\nRoom: ${room}\nOption: ${option}`;
            if (option !== 'Option 3') {
                orderMsg += `\nEggs: ${eggs}`;
            }
            orderMsg += `\nSide: ${side}`;
            orderMsg += `\nTime: ${time}`;

            // Send order to owner
            try {
                await client.sendMessage(OWNER_NUMBER, orderMsg);
            } catch (e) {
                console.error('Could not send order to owner:', e.message);
            }

            // Keep session alive so user can press 0 to book again
            session.step = 'done';
            return;
        }

        // DONE - awaiting 0 for another booking
        if (session.step === 'done') {
            await msg.reply('_Press 0 to make another booking_');
            return;
        }

    } catch (err) {
        console.error('Message handler error:', err.message);
    }
});

client.initialize();
