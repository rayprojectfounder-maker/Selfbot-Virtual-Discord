const { Client } = require('discord.js-selfbot-v13');
const fs = require('fs');
const path = require('path');

const client = new Client();

// Bot configuration
let currentMode = 'NormalMode';
let afkStatus = false;
let afkMessage = "I'm currently AFK. I'll respond when I return.";
let afkTimeout = null;
let originalNickname = null;
let isProcessing = false;
let loggingChannel = null;
let serverLogChannel = null;
const spiedUsers = new Map();

// Load custom colors from file
const customColorsPath = path.join(__dirname, 'customColors.json');
let customColors = {};

if (fs.existsSync(customColorsPath)) {
    try {
        customColors = JSON.parse(fs.readFileSync(customColorsPath, 'utf8'));
    } catch (error) {
        console.error('Error loading custom colors:', error);
    }
}

function saveCustomColors() {
    try {
        fs.writeFileSync(customColorsPath, JSON.stringify(customColors, null, 2));
    } catch (error) {
        console.error('Error saving custom colors:', error);
    }
}

// Function to delay responses
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Base color name to hex mapping
const baseColorMap = {
    'red': '#FF0000', 'blue': '#0000FF', 'green': '#00FF00', 'yellow': '#FFFF00',
    'purple': '#800080', 'pink': '#FFC0CB', 'orange': '#FFA500', 'black': '#000000',
    'white': '#FFFFFF', 'gray': '#808080', 'cyan': '#00FFFF', 'magenta': '#FF00FF',
    'lime': '#00FF00', 'maroon': '#800000', 'navy': '#000080', 'teal': '#008080',
    'olive': '#808000', 'silver': '#C0C0C0', 'gold': '#FFD700', 'coral': '#FF7F50',
    'brown': '#A52A2A', 'crimson': '#DC143C', 'darkblue': '#00008B', 'darkgreen': '#006400',
    'darkred': '#8B0000', 'darkpurple': '#800080', 'lightblue': '#ADD8E6', 'lightgreen': '#90EE90',
    'lightpink': '#FFB6C1', 'lightyellow': '#FFFFE0', 'violet': '#EE82EE', 'indigo': '#4B0082',
    'turquoise': '#40E0D0', 'aqua': '#00FFFF', 'salmon': '#FA8072', 'tomato': '#FF6347',
    'orchid': '#DA70D6', 'plum': '#DDA0DD', 'khaki': '#F0E68C', 'lavender': '#E6E6FA'
};

function getColorMap() {
    return {...baseColorMap, ...customColors};
}

// Permission templates
const permissionTemplates = {
    'cosmetic': ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY'],
    'mod': ['KICK_MEMBERS', 'BAN_MEMBERS', 'MANAGE_MESSAGES', 'MANAGE_NICKNAMES', 'MANAGE_ROLES'],
    'moderator': ['KICK_MEMBERS', 'BAN_MEMBERS', 'MANAGE_MESSAGES', 'MANAGE_NICKNAMES', 'MANAGE_ROLES'],
    'manager': ['MANAGE_CHANNELS', 'MANAGE_GUILD', 'MENTION_EVERYONE', 'MANAGE_WEBHOOKS'],
    'admin': ['ADMINISTRATOR'],
    'administrator': ['ADMINISTRATOR']
};

// Utility functions
function formatTime(ms) {
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    
    let result = [];
    if (days > 0) result.push(`${days}d`);
    if (hours > 0) result.push(`${hours}h`);
    if (minutes > 0) result.push(`${minutes}m`);
    if (seconds > 0) result.push(`${seconds}s`);
    
    return result.join(' ') || '0s';
}

function resolvePermissions(input) {
    if (!input) return [];
    
    const inputLower = input.toLowerCase();
    if (permissionTemplates[inputLower]) {
        return permissionTemplates[inputLower];
    }
    
    if (input.includes(',')) {
        return input.split(',').map(p => p.trim().toUpperCase());
    }
    
    return [];
}

// Check if user has admin permissions
function hasAdminPermissions(member) {
    return member.permissions.has('ADMINISTRATOR') || member.guild.ownerId === member.id;
}

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Current mode: ${currentMode}`);
    originalNickname = client.user.username;
});

// Event handlers (userUpdate, guildMemberUpdate, guildUpdate, roleCreate, roleDelete, roleUpdate, channelCreate, channelDelete, channelUpdate)
// ... [Previous event handlers remain the same] ...

client.on('messageCreate', async message => {
    if (message.author.id !== client.user.id || isProcessing) return;
    
    const content = message.content.toLowerCase();
    if (!content.startsWith('virtual')) return;

    isProcessing = true;

    const args = message.content.slice('virtual'.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const thinkingMessage = await message.reply(`Virtual is thinking...`);
    await delay(800);

    try {
        // BAN COMMAND
        if (command === 'ban') {
            const user = message.mentions.users.first() || message.guild.members.cache.get(args[0]);
            const time = args[1];
            const reason = args.slice(2).join(' ');

            if (!user) {
                await thinkingMessage.edit('❌ User not found.');
                isProcessing = false;
                return;
            }
            
            const member = message.guild.members.cache.get(client.user.id);
            if (!hasAdminPermissions(member) && message.guild.members.cache.get(user.id).roles.highest.position >= member.roles.highest.position) {
                await thinkingMessage.edit('❌ Failed to ban user. User has higher role than me.');
                isProcessing = false;
                return;
            }

            try {
                await user.ban({ reason: reason, days: time });
                await thinkingMessage.edit(`✅ Successfully banned ${user.tag} ⚒️`);
            } catch (error) {
                console.error(`Error banning user: ${error}`);
                await thinkingMessage.edit(`❌ Failed to ban user. Missing BAN_MEMBERS permission.`);
            }
        }

        // KICK COMMAND
        else if (command === 'kick') {
            const user = message.mentions.users.first() || message.guild.members.cache.get(args[0]);

            if (!user) {
                await thinkingMessage.edit('❌ User not found.');
                isProcessing = false;
                return;
            }
            
            const member = message.guild.members.cache.get(client.user.id);
            if (!hasAdminPermissions(member) && message.guild.members.cache.get(user.id).roles.highest.position >= member.roles.highest.position) {
                await thinkingMessage.edit('❌ Failed to kick user. User has higher role than me.');
                isProcessing = false;
                return;
            }

            try {
                await user.kick();
                await thinkingMessage.edit(`✅ Successfully kicked ${user.tag}`);
            } catch (error) {
                console.error(`Error kicking user: ${error}`);
                await thinkingMessage.edit(`❌ Failed to kick user. Missing KICK_MEMBERS permission.`);
            }
        }

        // MUTE/TIMEOUT COMMAND
        else if (command === 'mute' || command === 'timeout') {
            const user = message.mentions.users.first() || message.guild.members.cache.get(args[0]);
            const time = args[1];
            const reason = args.slice(2).join(' ');

            if (!user) {
                await thinkingMessage.edit('❌ User not found.');
                isProcessing = false;
                return;
            }
            
            const member = message.guild.members.cache.get(client.user.id);
            if (!hasAdminPermissions(member) && message.guild.members.cache.get(user.id).roles.highest.position >= member.roles.highest.position) {
                await thinkingMessage.edit('❌ Failed to mute user. User has higher role than me.');
                isProcessing = false;
                return;
            }

            try {
                await user.timeout(time, reason);
                await thinkingMessage.edit(`✅ Successfully muted ${user.tag}`);
            } catch (error) {
                console.error(`Error muting user: ${error}`);
                await thinkingMessage.edit(`❌ Failed to mute user. Missing MODERATE_MEMBERS permission.`);
            }
        }

        // PURGE/CLEAR COMMAND (1000 messages max, skips messages older than 1 month)
        else if (command === 'clear' || command === 'purge') {
            if (!message.guild) {
                await thinkingMessage.edit('❌ This command can only be used in a server.');
                isProcessing = false;
                return;
            }
            
            const amount = parseInt(args[0]) || 100;
            
            if (amount > 1000) {
                await thinkingMessage.edit('❌ You can only clear up to 1000 messages at once.');
                isProcessing = false;
                return;
            }
            
            try {
                const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
                const messages = await message.channel.messages.fetch({ limit: amount });
                const messagesToDelete = messages.filter(msg => msg.createdTimestamp > oneMonthAgo);
                
                if (messagesToDelete.size === 0) {
                    await thinkingMessage.edit('❌ No messages found from the last month to delete.');
                    isProcessing = false;
                    return;
                }
                
                await message.channel.bulkDelete(messagesToDelete);
                await thinkingMessage.edit(`✅ Cleared ${messagesToDelete.size} messages (from last month).`);
            } catch (error) {
                console.error('Error clearing messages:', error);
                await thinkingMessage.edit(`❌ Failed to clear messages. ${hasAdminPermissions(message.member) ? 'Try in smaller batches.' : 'Missing MANAGE_MESSAGES permission.'}`);
            }
        }

        // SPAM COMMAND (250 messages max, faster sending)
        else if (command === 'spam') {
            const count = Math.min(parseInt(args[0]) || 5, 250);
            const text = args.slice(1).join(' ');
            
            if (!text) {
                await thinkingMessage.edit('❌ Please provide text to spam.');
                isProcessing = false;
                return;
            }
            
            await thinkingMessage.edit(`🌀 Spamming ${count} times...`);
            
            // Fast spam with minimal delay
            for (let i = 0; i < count; i++) {
                await message.channel.send(text).catch(console.error);
                await delay(100); // Reduced delay for faster spamming
            }
        }

        // NICKNAME COMMAND
        else if (command === 'nick' || command === 'nickname') {
            if (!message.guild) {
                await thinkingMessage.edit('❌ This command can only be used in a server.');
                isProcessing = false;
                return;
            }
            
            const targetUser = message.mentions.users.first();
            const newNickname = args.slice(1).join(' ');
            
            if (!targetUser || !newNickname) {
                await thinkingMessage.edit('❌ Usage: virtual nick @user <new nickname>');
                isProcessing = false;
                return;
            }
            
            const member = message.guild.members.cache.get(targetUser.id);
            if (!member) {
                await thinkingMessage.edit('❌ User not found in this server.');
                isProcessing = false;
                return;
            }
            
            const botMember = message.guild.members.cache.get(client.user.id);
            if (!hasAdminPermissions(botMember) && member.roles.highest.position >= botMember.roles.highest.position) {
                await thinkingMessage.edit('❌ Cannot change nickname. User has higher role than me.');
                isProcessing = false;
                return;
            }
            
            try {
                await member.setNickname(newNickname);
                await thinkingMessage.edit(`✅ Successfully changed ${targetUser.tag}'s nickname to "${newNickname}"`);
            } catch (error) {
                console.error('Error changing nickname:', error);
                await thinkingMessage.edit(`❌ Failed to change nickname. Missing MANAGE_NICKNAMES permission.`);
            }
        }

        // RESET NICKNAME COMMAND
        else if (command === 'resetnick') {
            if (!message.guild) {
                await thinkingMessage.edit('❌ This command can only be used in a server.');
                isProcessing = false;
                return;
            }
            
            const targetUser = message.mentions.users.first();
            
            if (!targetUser) {
                await thinkingMessage.edit('❌ Please mention a user.');
                isProcessing = false;
                return;
            }
            
            const member = message.guild.members.cache.get(targetUser.id);
            if (!member) {
                await thinkingMessage.edit('❌ User not found in this server.');
                isProcessing = false;
                return;
            }
            
            const botMember = message.guild.members.cache.get(client.user.id);
            if (!hasAdminPermissions(botMember) && member.roles.highest.position >= botMember.roles.highest.position) {
                await thinkingMessage.edit('❌ Cannot reset nickname. User has higher role than me.');
                isProcessing = false;
                return;
            }
            
            try {
                await member.setNickname(null);
                await thinkingMessage.edit(`✅ Successfully reset ${targetUser.tag}'s nickname`);
            } catch (error) {
                console.error('Error resetting nickname:', error);
                await thinkingMessage.edit(`❌ Failed to reset nickname. Missing MANAGE_NICKNAMES permission.`);
            }
        }

        // SERVER STATS COMMAND
        else if (command === 'serverstats') {
            if (!message.guild) {
                await thinkingMessage.edit('❌ This command can only be used in a server.');
                isProcessing = false;
                return;
            }
            
            const { guild } = message;
            const members = await guild.members.fetch();
            
            const online = members.filter(m => m.presence?.status === 'online').size;
            const idle = members.filter(m => m.presence?.status === 'idle').size;
            const dnd = members.filter(m => m.presence?.status === 'dnd').size;
            const offline = members.filter(m => !m.presence?.status || m.presence.status === 'offline').size;
            const bots = members.filter(m => m.user.bot).size;
            
            const textChannels = guild.channels.cache.filter(c => c.type === 'GUILD_TEXT').size;
            const voiceChannels = guild.channels.cache.filter(c => c.type === 'GUILD_VOICE').size;
            const categories = guild.channels.cache.filter(c => c.type === 'GUILD_CATEGORY').size;
            
            const stats = `
            **📊 Server Statistics:**
            👥 Total Members: ${guild.memberCount}
            🟢 Online: ${online} | 🟡 Idle: ${idle} | 🔴 DND: ${dnd} | ⚫ Offline: ${offline}
            🤖 Bots: ${bots} | 👤 Humans: ${guild.memberCount - bots}
            
            **📁 Channels:**
            💬 Text: ${textChannels} | 🔊 Voice: ${voiceChannels} | 📂 Categories: ${categories}
            🎭 Roles: ${guild.roles.cache.size}
            
            **✨ Boosts:**
            Level ${guild.premiumTier} with ${guild.premiumSubscriptionCount} boosts
            `;
            
            await thinkingMessage.edit(stats);
        }

        // ROLE INFO COMMAND
        else if (command === 'roleinfo') {
            if (!message.guild) {
                await thinkingMessage.edit('❌ This command can only be used in a server.');
                isProcessing = false;
                return;
            }
            
            const roleMention = message.mentions.roles.first();
            const roleName = args.join(' ');
            
            if (!roleMention && !roleName) {
                await thinkingMessage.edit('❌ Please mention a role or provide a role name.');
                isProcessing = false;
                return;
            }
            
            const role = roleMention || message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
            if (!role) {
                await thinkingMessage.edit('❌ Role not found.');
                isProcessing = false;
                return;
            }
            
            const membersWithRole = role.members.size;
            const roleInfo = `
            **🎭 Role Information:**
            Name: ${role.name}
            ID: ${role.id}
            Color: ${role.hexColor}
            Position: ${role.position}
            Members: ${membersWithRole}
            Created: ${role.createdAt.toDateString()}
            Hoisted: ${role.hoist ? 'Yes' : 'No'}
            Mentionable: ${role.mentionable ? 'Yes' : 'No'}
            Permissions: ${role.permissions.toArray().join(', ') || 'None'}
            `;
            
            await thinkingMessage.edit(roleInfo);
        }

        // CHANNEL INFO COMMAND
        else if (command === 'channelinfo') {
            if (!message.guild) {
                await thinkingMessage.edit('❌ This command can only be used in a server.');
                isProcessing = false;
                return;
            }
            
            const channel = message.mentions.channels.first() || message.channel;
            const channelInfo = `
            **📁 Channel Information:**
            Name: ${channel.name}
            ID: ${channel.id}
            Type: ${channel.type}
            Created: ${channel.createdAt.toDateString()}
            Position: ${channel.position}
            ${channel.topic ? `Topic: ${channel.topic}` : ''}
            ${channel.parent ? `Category: ${channel.parent.name}` : ''}
            `;
            
            await thinkingMessage.edit(channelInfo);
        }

        // EMOJI LIST COMMAND
        else if (command === 'emojis') {
            if (!message.guild) {
                await thinkingMessage.edit('❌ This command can only be used in a server.');
                isProcessing = false;
                return;
            }
            
            const emojis = message.guild.emojis.cache;
            if (emojis.size === 0) {
                await thinkingMessage.edit('❌ This server has no custom emojis.');
                isProcessing = false;
                return;
            }
            
            const emojiList = emojis.map(e => `${e} \\:${e.name}:`).join('\n');
            await thinkingMessage.edit(`**😊 Server Emojis (${emojis.size}):**\n${emojiList}`);
        }

        // INVITE CREATOR COMMAND
        else if (command === 'createinvite') {
            if (!message.guild) {
                await thinkingMessage.edit('❌ This command can only be used in a server.');
                isProcessing = false;
                return;
            }
            
            const maxUses = parseInt(args[0]) || 0;
            const maxAge = parseInt(args[1]) || 86400; // Default 24 hours
            const temporary = args.includes('temp');
            
            try {
                const invite = await message.channel.createInvite({
                    maxUses: maxUses,
                    maxAge: maxAge,
                    temporary: temporary,
                    reason: `Invite created by ${client.user.tag}`
                });
                
                await thinkingMessage.edit(`✅ Invite created: https://discord.gg/${invite.code}`);
            } catch (error) {
                console.error('Error creating invite:', error);
                await thinkingMessage.edit('❌ Failed to create invite. Missing CREATE_INSTANT_INVITE permission.');
            }
        }

        // ... [Other commands remain similar with permission checks] ...

        // HELP COMMAND (split into multiple messages)
        else if (command === 'help') {
            const helpMessage1 = `
            **🤖 Virtual Selfbot - Command List (1/3)**
            
            **🔧 Utility Commands:**
            \`virtual hi\` - Greet the creator
            \`virtual greet <user/name>\` - Greet a user
            \`virtual spam <count> <text>\` - Spam text (max 250)
            \`virtual afk [time] [message]\` - Enable AFK mode
            \`virtual unafk\` - Disable AFK mode
            \`virtual serverinfo\` - Show server information
            \`virtual userinfo [user]\` - Show user information
            \`virtual serverstats\` - Detailed server statistics
            \`virtual roleinfo <role>\` - Show role information
            \`virtual channelinfo [channel]\` - Show channel information
            \`virtual emojis\` - List server emojis
            `;

            await thinkingMessage.edit(helpMessage1);
            
            const helpMessage2 = `
            **🤖 Virtual Selfbot - Command List (2/3)**
            
            **🛡️ Moderation Commands:**
            \`virtual ban <user> [time] [reason]\` - Ban a user
            \`virtual kick <user> [reason]\` - Kick a user
            \`virtual mute/timeout <user> [time] [reason]\` - Mute a user
            \`virtual clear/purge [amount]\` - Clear messages (max 1000, last month only)
            \`virtual nick @user <nickname>\` - Change user's nickname
            \`virtual resetnick @user\` - Reset user's nickname
            \`virtual createinvite [uses] [age] [temp]\` - Create invite
            `;

            await message.channel.send(helpMessage2);
            
            const helpMessage3 = `
            **🤖 Virtual Selfbot - Command List (3/3)**
            
            **🎭 Role Management:**
            \`virtual createrole <name> [color] [perms]\` - Create a role
            \`virtual giverole <user> <role>\` - Give a role
            \`virtual removerole <user> <role>\` - Remove a role
            \`virtual updaterole <role> [changes]\` - Update a role
            
            **🎨 Color Commands:**
            \`virtual colors\` - List all colors
            \`virtual addcolor <name> <hex>\` - Add custom color
            \`virtual removecolor <name>\` - Remove custom color
            \`virtual customcolors\` - List custom colors
            
            **🕵️ Logging Commands:**
            \`virtual setlogchannel\` - Set user logging channel
            \`virtual setserverlog\` - Set server logging channel
            \`virtual spyuser <user> [options]\` - Spy on a user
            \`virtual unspyuser <user>\` - Stop spying on user
            \`virtual spiedusers\` - List spied users
            
            **🎛️ Bot Settings:**
            \`virtual changemodes\` - Change bot mode
            \`virtual help\` - Show this help
            `;

            await message.channel.send(helpMessage3);
        }

        // ... [Other mode-specific commands] ...

    } catch (error) {
        console.error(`Error executing command: ${error}`);
        await thinkingMessage.edit(`❌ An error occurred: ${error.message}`);
    }
    
    isProcessing = false;
});

// AFK functionality
client.on('messageCreate', async message => {
    if (afkStatus && message.author.id !== client.user.id && message.mentions.has(client.user.id)) {
        let timeRemaining = '';
        if (afkTimeout && afkTimeout._idleTimeout > 0) {
            const remainingMs = afkTimeout._idleTimeout;
            const hours = Math.floor(remainingMs / (1000 * 60 * 60));
            const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
            
            if (hours > 0) timeRemaining = ` for ${hours}h ${minutes}m`;
            else if (minutes > 0) timeRemaining = ` for ${minutes}m`;
        }
        
        await message.reply(`⏰ I'm currently AFK${timeRemaining}. ${afkMessage}`);
    }
});

// Login with your token
client.login('YOUR_DISCORD_TOKEN_HERE');
