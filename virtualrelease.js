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

// Load custom colors if file exists
if (fs.existsSync(customColorsPath)) {
    try {
        customColors = JSON.parse(fs.readFileSync(customColorsPath, 'utf8'));
    } catch (error) {
        console.error('Error loading custom colors:', error);
    }
}

// Function to save custom colors
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

// Combined color map (base + custom)
function getColorMap() {
    return {...baseColorMap, ...customColors};
}

// Permission templates with case-insensitive matching
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

// Function to resolve permissions from input
function resolvePermissions(input) {
    if (!input) return [];
    
    const inputLower = input.toLowerCase();
    
    // Check if it matches a template
    if (permissionTemplates[inputLower]) {
        return permissionTemplates[inputLower];
    }
    
    // Check if it's a comma-separated list
    if (input.includes(',')) {
        return input.split(',').map(p => p.trim().toUpperCase());
    }
    
    // Default to empty
    return [];
}

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Current mode: ${currentMode}`);
    originalNickname = client.user.username;
});

// User change tracking
client.on('userUpdate', (oldUser, newUser) => {
    if (spiedUsers.has(newUser.id) && loggingChannel) {
        const spySettings = spiedUsers.get(newUser.id);
        if (!spySettings.trackUser) return;
        
        const changes = [];
        if (oldUser.username !== newUser.username) {
            changes.push(`Username: ${oldUser.username} → ${newUser.username}`);
        }
        if (oldUser.avatar !== newUser.avatar) {
            changes.push('Avatar changed');
        }
        
        if (changes.length > 0) {
            loggingChannel.send(`👤 **User Update Detected**\nUser: ${newUser.tag}\nChanges:\n${changes.join('\n')}`)
                .catch(console.error);
        }
    }
});

client.on('guildMemberUpdate', (oldMember, newMember) => {
    if (spiedUsers.has(newMember.id) && loggingChannel) {
        const spySettings = spiedUsers.get(newMember.id);
        const changes = [];
        
        if (spySettings.trackNickname && oldMember.nickname !== newMember.nickname) {
            changes.push(`Nickname: ${oldMember.nickname || 'None'} → ${newMember.nickname || 'None'}`);
        }
        
        if (spySettings.trackRoles && oldMember.roles.cache.size !== newMember.roles.cache.size) {
            const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
            const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
            
            if (addedRoles.size > 0) {
                changes.push(`Added roles: ${addedRoles.map(r => r.name).join(', ')}`);
            }
            if (removedRoles.size > 0) {
                changes.push(`Removed roles: ${removedRoles.map(r => r.name).join(', ')}`);
            }
        }
        
        if (changes.length > 0) {
            loggingChannel.send(`👤 **Member Update Detected**\nMember: ${newMember.user.tag}\nChanges:\n${changes.join('\n')}`)
                .catch(console.error);
        }
    }
});

// Server event tracking
client.on('guildUpdate', (oldGuild, newGuild) => {
    if (serverLogChannel) {
        const changes = [];
        if (oldGuild.name !== newGuild.name) {
            changes.push(`Name: ${oldGuild.name} → ${newGuild.name}`);
        }
        if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
            changes.push(`Verification Level: ${oldGuild.verificationLevel} → ${newGuild.verificationLevel}`);
        }
        
        if (changes.length > 0) {
            serverLogChannel.send(`🏰 **Server Updated**\n${changes.join('\n')}`)
                .catch(console.error);
        }
    }
});

client.on('roleCreate', (role) => {
    if (serverLogChannel) {
        serverLogChannel.send(`🎭 **Role Created**\nName: ${role.name}\nColor: ${role.hexColor}`)
            .catch(console.error);
    }
});

client.on('roleDelete', (role) => {
    if (serverLogChannel) {
        serverLogChannel.send(`🎭 **Role Deleted**\nName: ${role.name}`)
            .catch(console.error);
    }
});

client.on('roleUpdate', (oldRole, newRole) => {
    if (serverLogChannel) {
        const changes = [];
        if (oldRole.name !== newRole.name) {
            changes.push(`Name: ${oldRole.name} → ${newRole.name}`);
        }
        if (oldRole.hexColor !== newRole.hexColor) {
            changes.push(`Color: ${oldRole.hexColor} → ${newRole.hexColor}`);
        }
        
        if (changes.length > 0) {
            serverLogChannel.send(`🎭 **Role Updated**\nRole: ${newRole.name}\nChanges:\n${changes.join('\n')}`)
                .catch(console.error);
        }
    }
});

client.on('channelCreate', (channel) => {
    if (serverLogChannel) {
        serverLogChannel.send(`📁 **Channel Created**\nName: ${channel.name}\nType: ${channel.type}`)
            .catch(console.error);
    }
});

client.on('channelDelete', (channel) => {
    if (serverLogChannel) {
        serverLogChannel.send(`📁 **Channel Deleted**\nName: ${channel.name}\nType: ${channel.type}`)
            .catch(console.error);
    }
});

client.on('channelUpdate', (oldChannel, newChannel) => {
    if (serverLogChannel) {
        const changes = [];
        if (oldChannel.name !== newChannel.name) {
            changes.push(`Name: ${oldChannel.name} → ${newChannel.name}`);
        }
        
        if (changes.length > 0) {
            serverLogChannel.send(`📁 **Channel Updated**\nChannel: ${newChannel.name}\nChanges:\n${changes.join('\n')}`)
                .catch(console.error);
        }
    }
});

client.on('messageCreate', async message => {
    // Prevent the bot from responding to itself and avoid multiple command processing
    if (message.author.id !== client.user.id || isProcessing) return;
    
    // Make command case-insensitive
    const content = message.content.toLowerCase();
    if (!content.startsWith('virtual')) return;

    isProcessing = true;

    const args = message.content.slice('virtual'.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Send initial thinking message
    const thinkingMessage = await message.reply(`Virtual is thinking...`);
    
    // Wait 0.8 seconds before processing (optimized)
    await delay(800);

    try {
        if (command === 'ban') {
            const user = message.mentions.users.first() || message.guild.members.cache.get(args[0]);
            const time = args[1];
            const reason = args.slice(2).join(' ');

            if (!user) {
                await thinkingMessage.edit('❌ User not found.');
                isProcessing = false;
                return;
            }
            
            // Check if user is above the bot (unless server owner)
            const isServerOwner = message.guild.ownerId === client.user.id;
            if (!isServerOwner && message.guild.members.cache.get(user.id).roles.highest.position >= 
                message.guild.members.cache.get(client.user.id).roles.highest.position) {
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

        else if (command === 'kick') {
            const user = message.mentions.users.first() || message.guild.members.cache.get(args[0]);

            if (!user) {
                await thinkingMessage.edit('❌ User not found.');
                isProcessing = false;
                return;
            }
            
            // Check if user is above the bot (unless server owner)
            const isServerOwner = message.guild.ownerId === client.user.id;
            if (!isServerOwner && message.guild.members.cache.get(user.id).roles.highest.position >= 
                message.guild.members.cache.get(client.user.id).roles.highest.position) {
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

        else if (command === 'mute' || command === 'timeout') {
            const user = message.mentions.users.first() || message.guild.members.cache.get(args[0]);
            const time = args[1];
            const reason = args.slice(2).join(' ');

            if (!user) {
                await thinkingMessage.edit('❌ User not found.');
                isProcessing = false;
                return;
            }
            
            // Check if user is above the bot (unless server owner)
            const isServerOwner = message.guild.ownerId === client.user.id;
            if (!isServerOwner && message.guild.members.cache.get(user.id).roles.highest.position >= 
                message.guild.members.cache.get(client.user.id).roles.highest.position) {
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

        else if (command === 'changemodes') {
            const modesMessage = await thinkingMessage.edit(`**🎭 Available Modes:**\n\n- BitchMode\n- LoverMode\n- CoderMode\n- NormalMode`);

            const filter = m => m.author.id === message.author.id;
            const collector = modesMessage.channel.createMessageCollector({ filter, time: 15000 });

            collector.on('collect', async m => {
                const chosenMode = m.content.trim();

                if (['BitchMode', 'LoverMode', 'CoderMode', 'NormalMode'].includes(chosenMode)) {
                    currentMode = chosenMode;
                    await modesMessage.edit(`✅ Successfully changed mode to **${chosenMode}**`);
                    collector.stop();
                } else {
                    await modesMessage.edit(`❌ Invalid mode. Please choose from the available modes.`);
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    modesMessage.edit(`⏰ No mode selected. Mode remains **${currentMode}**`);
                }
                isProcessing = false;
            });
            return;
        }

        else if (command === 'hi') {
            await thinkingMessage.edit('👋 Hello, Creator :D');
        }

        else if (command === 'greet') {
            const user = message.mentions.users.first() || args[0];
            if (!user) {
                await thinkingMessage.edit('❌ Please mention a user or provide a name.');
                isProcessing = false;
                return;
            }
            
            if (message.mentions.users.first()) {
                await thinkingMessage.edit(`👋 Hello, <@${user.id}>! :D`);
            } else {
                await thinkingMessage.edit(`👋 Hello, ${user}! :D`);
            }
        }

        else if (command === 'spam') {
            const count = parseInt(args[0]) || 5;
            const text = args.slice(1).join(' ');
            
            if (!text) {
                await thinkingMessage.edit('❌ Please provide text to spam.');
                isProcessing = false;
                return;
            }
            if (count > 20) {
                await thinkingMessage.edit('❌ Maximum spam count is 20.');
                isProcessing = false;
                return;
            }
            
            await thinkingMessage.edit(`🌀 Spamming ${count} times...`);
            
            for (let i = 0; i < count; i++) {
                await message.channel.send(text);
                await delay(500);
            }
        }

        else if (command === 'afk') {
            // Parse time if provided (e.g., "30m", "2h", "1d")
            let timeAmount = 0;
            let timeUnit = '';
            let timeMs = 0;
            
            if (args.length > 0 && !isNaN(parseInt(args[0].slice(0, -1)))) {
                timeAmount = parseInt(args[0].slice(0, -1));
                timeUnit = args[0].slice(-1).toLowerCase();
                
                switch(timeUnit) {
                    case 's': timeMs = timeAmount * 1000; break;
                    case 'm': timeMs = timeAmount * 60 * 1000; break;
                    case 'h': timeMs = timeAmount * 60 * 60 * 1000; break;
                    case 'd': timeMs = timeAmount * 24 * 60 * 60 * 1000; break;
                    default: timeMs = 0;
                }
                
                // Remove time from args for the message
                args.shift();
            }
            
            afkStatus = true;
            const customMessage = args.join(' ');
            
            if (customMessage) {
                afkMessage = customMessage;
            }
            
            // Change nickname if in a guild
            if (message.guild) {
                try {
                    const member = message.guild.members.cache.get(client.user.id);
                    originalNickname = member.nickname || client.user.username;
                    await member.setNickname(`[AFK] ${originalNickname}`);
                    
                    // Set timeout to automatically disable AFK
                    if (timeMs > 0) {
                        if (afkTimeout) clearTimeout(afkTimeout);
                        afkTimeout = setTimeout(() => {
                            afkStatus = false;
                            member.setNickname(originalNickname);
                            message.channel.send('🔄 AFK mode has been automatically disabled.');
                        }, timeMs);
                    }
                } catch (error) {
                    console.error('Error changing nickname:', error);
                }
            }
            
            let statusMessage = `⏰ AFK mode is now ON.`;
            if (timeMs > 0) {
                statusMessage += ` Will auto-disable in ${timeAmount}${timeUnit}.`;
            }
            if (customMessage) {
                statusMessage += ' Custom message set.';
            }
            
            await thinkingMessage.edit(statusMessage);
        }

        else if (command === 'unafk') {
            if (!afkStatus) {
                await thinkingMessage.edit('❌ AFK mode is not currently enabled.');
                isProcessing = false;
                return;
            }
            
            afkStatus = false;
            
            // Restore original nickname if in a guild
            if (message.guild) {
                try {
                    const member = message.guild.members.cache.get(client.user.id);
                    await member.setNickname(originalNickname);
                } catch (error) {
                    console.error('Error restoring nickname:', error);
                }
            }
            
            if (afkTimeout) {
                clearTimeout(afkTimeout);
                afkTimeout = null;
            }
            
            await thinkingMessage.edit('🔄 AFK mode has been disabled.');
        }

        else if (command === 'createrole') {
            if (!message.guild) {
                await thinkingMessage.edit('❌ This command can only be used in a server.');
                isProcessing = false;
                return;
            }
            
            const name = args[0];
            let color = args[1];
            const permissionType = args.slice(2).join(' ');
            
            if (!name) {
                await thinkingMessage.edit('❌ Please provide a role name.');
                isProcessing = false;
                return;
            }
            
            // Process color
            const colorMap = getColorMap();
            if (color) {
                if (colorMap[color.toLowerCase()]) {
                    color = colorMap[color.toLowerCase()];
                } else if (!color.startsWith('#')) {
                    color = '#' + color;
                }
            } else {
                color = '#99aab5';
            }
            
            // Get permissions
            const permissions = resolvePermissions(permissionType);
            
            try {
                const role = await message.guild.roles.create({
                    name: name,
                    color: color,
                    permissions: permissions,
                    reason: `Role created by ${client.user.tag}`
                });
                
                await thinkingMessage.edit(`✅ Successfully created role ${role.name}`);
            } catch (error) {
                console.error('Error creating role:', error);
                await thinkingMessage.edit(`❌ Failed to create role. Missing MANAGE_ROLES permission.`);
            }
        }

        else if (command === 'giverole') {
            if (!message.guild) {
                await thinkingMessage.edit('❌ This command can only be used in a server.');
                isProcessing = false;
                return;
            }
            
            const user = message.mentions.users.first() || message.guild.members.cache.get(args[0]);
            const roleName = args.slice(1).join(' ');
            
            if (!user) {
                await thinkingMessage.edit('❌ Please mention a user or provide a user ID.');
                isProcessing = false;
                return;
            }
            if (!roleName) {
                await thinkingMessage.edit('❌ Please provide a role name.');
                isProcessing = false;
                return;
            }
            
            const member = message.guild.members.cache.get(user.id);
            const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
            
            if (!role) {
                await thinkingMessage.edit('❌ Role not found.');
                isProcessing = false;
                return;
            }
            
            // Check if role is higher than bot's highest role (unless server owner)
            const isServerOwner = message.guild.ownerId === client.user.id;
            if (!isServerOwner && role.position >= message.guild.members.cache.get(client.user.id).roles.highest.position) {
                await thinkingMessage.edit('❌ Failed to give role. The role is higher than my highest role.');
                isProcessing = false;
                return;
            }
            
            try {
                await member.roles.add(role);
                await thinkingMessage.edit(`✅ Successfully gave ${role.name} role to ${user.tag}`);
            } catch (error) {
                console.error('Error giving role:', error);
                await thinkingMessage.edit(`❌ Failed to give role. Missing MANAGE_ROLES permission.`);
            }
        }

        else if (command === 'removerole') {
            if (!message.guild) {
                await thinkingMessage.edit('❌ This command can only be used in a server.');
                isProcessing = false;
                return;
            }
            
            const user = message.mentions.users.first() || message.guild.members.cache.get(args[0]);
            const roleName = args.slice(1).join(' ');
            
            if (!user) {
                await thinkingMessage.edit('❌ Please mention a user or provide a user ID.');
                isProcessing = false;
                return;
            }
            if (!roleName) {
                await thinkingMessage.edit('❌ Please provide a role name.');
                isProcessing = false;
                return;
            }
            
            const member = message.guild.members.cache.get(user.id);
            const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
            
            if (!role) {
                await thinkingMessage.edit('❌ Role not found.');
                isProcessing = false;
                return;
            }
            
            // Check if role is higher than bot's highest role (unless server owner)
            const isServerOwner = message.guild.ownerId === client.user.id;
            if (!isServerOwner && role.position >= message.guild.members.cache.get(client.user.id).roles.highest.position) {
                await thinkingMessage.edit('❌ Failed to remove role. The role is higher than my highest role.');
                isProcessing = false;
                return;
            }
            
            try {
                await member.roles.remove(role);
                await thinkingMessage.edit(`✅ Successfully removed ${role.name} role from ${user.tag}`);
            } catch (error) {
                console.error('Error removing role:', error);
                await thinkingMessage.edit(`❌ Failed to remove role. Missing MANAGE_ROLES permission.`);
            }
        }

        else if (command === 'updaterole' || command === 'editrole') {
            if (!message.guild) {
                await thinkingMessage.edit('❌ This command can only be used in a server.');
                isProcessing = false;
                return;
            }
            
            const roleMention = message.mentions.roles.first();
            const roleName = roleMention ? roleMention.name : args[0];
            const restArgs = roleMention ? args.slice(1) : args.slice(1);
            
            if (!roleName) {
                await thinkingMessage.edit('❌ Please provide a role name or mention.');
                isProcessing = false;
                return;
            }
            
            const role = roleMention || message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
            if (!role) {
                await thinkingMessage.edit('❌ Role not found.');
                isProcessing = false;
                return;
            }
            
            // Check if role is higher than bot's highest role (unless server owner)
            const isServerOwner = message.guild.ownerId === client.user.id;
            if (!isServerOwner && role.position >= message.guild.members.cache.get(client.user.id).roles.highest.position) {
                await thinkingMessage.edit('❌ Failed to edit role. The role is higher than my highest role.');
                isProcessing = false;
                return;
            }
            
            let newName = role.name;
            let newColor = role.hexColor;
            let newPermissions = role.permissions;
            
            // Parse the arguments to see what to update
            for (let i = 0; i < restArgs.length; i++) {
                const arg = restArgs[i];
                
                // Check for color (hex or color name)
                if (arg.startsWith('#') || getColorMap()[arg.toLowerCase()]) {
                    const colorMap = getColorMap();
                    if (colorMap[arg.toLowerCase()]) {
                        newColor = colorMap[arg.toLowerCase()];
                    } else {
                        newColor = arg;
                    }
                }
                // Check for permission template
                else if (arg.toLowerCase().startsWith('perm:')) {
                    const permArg = arg.slice(5).toLowerCase();
                    newPermissions = resolvePermissions(permArg);
                }
                // Otherwise assume it's a new name
                else {
                    newName = arg;
                }
            }
            
            try {
                await role.edit({
                    name: newName,
                    color: newColor,
                    permissions: newPermissions,
                });
                
                await thinkingMessage.edit(`✅ Successfully updated role ${role.name}`);
            } catch (error) {
                console.error('Error updating role:', error);
                await thinkingMessage.edit(`❌ Failed to update role. Missing MANAGE_ROLES permission.`);
            }
        }

        // Color management commands
        else if (command === 'colors' || command === 'colorlist') {
            const colorMap = getColorMap();
            const colorList = Object.entries(colorMap)
                .map(([name, hex]) => `${name}: ${hex}`)
                .join('\n');
            
            await thinkingMessage.edit(`🎨 **Available Colors:**\n\`\`\`${colorList}\`\`\``);
        }

        else if (command === 'addcolor') {
            const colorName = args[0];
            const colorHex = args[1];
            
            if (!colorName || !colorHex) {
                await thinkingMessage.edit('❌ Usage: virtual addcolor <name> <hex>');
                isProcessing = false;
                return;
            }
            
            if (!colorHex.startsWith('#')) {
                await thinkingMessage.edit('❌ Color must be a valid hex code starting with #');
                isProcessing = false;
                return;
            }
            
            customColors[colorName.toLowerCase()] = colorHex;
            saveCustomColors();
            
            await thinkingMessage.edit(`✅ Added custom color: ${colorName} = ${colorHex}`);
        }

        else if (command === 'removecolor') {
            const colorName = args[0];
            
            if (!colorName) {
                await thinkingMessage.edit('❌ Please provide a color name to remove.');
                isProcessing = false;
                return;
            }
            
            if (!customColors[colorName.toLowerCase()]) {
                await thinkingMessage.edit('❌ Custom color not found.');
                isProcessing = false;
                return;
            }
            
            delete customColors[colorName.toLowerCase()];
            saveCustomColors();
            
            await thinkingMessage.edit(`✅ Removed custom color: ${colorName}`);
        }

        else if (command === 'customcolors') {
            if (Object.keys(customColors).length === 0) {
                await thinkingMessage.edit('❌ No custom colors have been added yet.');
                isProcessing = false;
                return;
            }
            
            const customColorList = Object.entries(customColors)
                .map(([name, hex]) => `${name}: ${hex}`)
                .join('\n');
            
            await thinkingMessage.edit(`🎨 **Custom Colors:**\n\`\`\`${customColorList}\`\`\``);
        }

        // Logging commands
        else if (command === 'setlogchannel') {
            if (!message.guild) {
                await thinkingMessage.edit('❌ This command can only be used in a server.');
                isProcessing = false;
                return;
            }
            
            loggingChannel = message.channel;
            await thinkingMessage.edit(`✅ Logging channel set to this channel.`);
        }

        else if (command === 'setserverlog') {
            if (!message.guild) {
                await thinkingMessage.edit('❌ This command can only be used in a server.');
                isProcessing = false;
                return;
            }
            
            serverLogChannel = message.channel;
            await thinkingMessage.edit(`✅ Server log channel set to this channel.`);
        }

        else if (command === 'spyuser') {
            const user = message.mentions.users.first() || message.guild.members.cache.get(args[0]);
            const options = args.slice(1);
            
            if (!user) {
                await thinkingMessage.edit('❌ Please mention a user or provide a user ID.');
                isProcessing = false;
                return;
            }
            
            if (spiedUsers.has(user.id)) {
                await thinkingMessage.edit('❌ User is already being spied on.');
                isProcessing = false;
                return;
            }
            
            // Default spy settings
            const spySettings = {
                trackUser: true,
                trackNickname: true,
                trackRoles: true
            };
            
            // Parse options
            if (options.includes('nouname')) spySettings.trackUser = false;
            if (options.includes('nonickname')) spySettings.trackNickname = false;
            if (options.includes('noroles')) spySettings.trackRoles = false;
            
            spiedUsers.set(user.id, spySettings);
            await thinkingMessage.edit(`✅ Now spying on ${user.tag} with options: ${JSON.stringify(spySettings)}`);
        }

        else if (command === 'unspyuser') {
            const user = message.mentions.users.first() || message.guild.members.cache.get(args[0]);
            
            if (!user) {
                await thinkingMessage.edit('❌ Please mention a user or provide a user ID.');
                isProcessing = false;
                return;
            }
            
            if (!spiedUsers.has(user.id)) {
                await thinkingMessage.edit('❌ User is not being spied on.');
                isProcessing = false;
                return;
            }
            
            spiedUsers.delete(user.id);
            await thinkingMessage.edit(`✅ Stopped spying on ${user.tag}.`);
        }

        else if (command === 'spiedusers') {
            if (spiedUsers.size === 0) {
                await thinkingMessage.edit('❌ No users are currently being spied on.');
                isProcessing = false;
                return;
            }
            
            const userList = Array.from(spiedUsers.entries()).map(([id, settings]) => {
                const user = client.users.cache.get(id);
                return user ? `${user.tag} - ${JSON.stringify(settings)}` : `Unknown (${id})`;
            }).join('\n');
            
            await thinkingMessage.edit(`**👥 Spied Users:**\n${userList}`);
        }

        // New utility commands
        else if (command === 'clear' || command === 'purge') {
            if (!message.guild) {
                await thinkingMessage.edit('❌ This command can only be used in a server.');
                isProcessing = false;
                return;
            }
            
            const amount = parseInt(args[0]) || 10;
            
            if (amount > 100) {
                await thinkingMessage.edit('❌ You can only clear up to 100 messages at once.');
                isProcessing = false;
                return;
            }
            
            try {
                const messages = await message.channel.messages.fetch({ limit: amount });
                await message.channel.bulkDelete(messages);
                await thinkingMessage.edit(`✅ Cleared ${amount} messages.`);
            } catch (error) {
                console.error('Error clearing messages:', error);
                await thinkingMessage.edit(`❌ Failed to clear messages. Missing MANAGE_MESSAGES permission.`);
            }
        }

        else if (command === 'serverinfo') {
            if (!message.guild) {
                await thinkingMessage.edit('❌ This command can only be used in a server.');
                isProcessing = false;
                return;
            }
            
            const { guild } = message;
            const owner = await guild.fetchOwner();
            const members = await guild.members.fetch();
            const onlineMembers = members.filter(m => m.presence?.status === 'online').size;
            const botCount = members.filter(m => m.user.bot).size;
            
            const serverInfo = `
            **📊 Server Information:**
            🏷️ Name: ${guild.name}
            👑 Owner: ${owner.user.tag}
            🆔 ID: ${guild.id}
            📅 Created: ${guild.createdAt.toDateString()}
            👥 Members: ${guild.memberCount} (${onlineMembers} online, ${botCount} bots)
            📊 Channels: ${guild.channels.cache.size} total
            🎭 Roles: ${guild.roles.cache.size}
            🌐 Region: ${guild.preferredLocale}
            🔐 Verification: ${guild.verificationLevel}
            ✨ Boost Level: Tier ${guild.premiumTier} (${guild.premiumSubscriptionCount} boosts)
            `;
            
            await thinkingMessage.edit(serverInfo);
        }

        else if (command === 'userinfo') {
            const targetUser = message.mentions.users.first() || message.author;
            const member = message.guild ? message.guild.members.cache.get(targetUser.id) : null;
            
            // Calculate account age
            const accountAge = Date.now() - targetUser.createdTimestamp;
            
            let userStatus = 'Not in this server';
            let joinDate = 'N/A';
            let serverPosition = 'N/A';
            let roleCount = 0;
            let highestRole = 'N/A';
            let isModerator = false;
            let isManager = false;
            let isAdmin = false;
            let isOwner = false;
            
            if (member) {
                userStatus = member.presence?.status || 'offline';
                joinDate = member.joinedAt.toDateString();
                roleCount = member.roles.cache.size - 1; // Subtract @everyone
                highestRole = member.roles.highest.name;
                
                // Check permissions
                isModerator = member.permissions.has(['KICK_MEMBERS', 'BAN_MEMBERS', 'MANAGE_MESSAGES']);
                isManager = member.permissions.has(['MANAGE_CHANNELS', 'MANAGE_GUILD']);
                isAdmin = member.permissions.has('ADMINISTRATOR');
                isOwner = message.guild.ownerId === member.id;
                
                // Calculate server position (join order)
                const members = (await message.guild.members.fetch()).sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);
                serverPosition = Array.from(members.keys()).indexOf(member.id) + 1;
            }
            
            // Check if user is the bot creator
            const isCreator = targetUser.id === client.user.id;
            
            let userInfo = `
            **👤 User Information:**
            🏷️ Username: ${targetUser.tag}
            🆔 ID: ${targetUser.id}
            📅 Account Created: ${targetUser.createdAt.toDateString()}
            🕒 Account Age: ${formatTime(accountAge)}
            `;
            
            if (member) {
                userInfo += `
                📅 Joined Server: ${joinDate}
                🎯 Join Position: #${serverPosition}
                🎭 Roles: ${roleCount} roles
                👑 Highest Role: ${highestRole}
                📊 Status: ${userStatus}
                `;
                
                // Add server position badge
                let positionBadge = '';
                if (isOwner) positionBadge = '👑 Server Owner';
                else if (isAdmin) positionBadge = '🛡️ Administrator';
                else if (isManager) positionBadge = '💼 Manager';
                else if (isModerator) positionBadge = '⚔️ Moderator';
                
                if (positionBadge) {
                    userInfo += `🏅 Server Position: ${positionBadge}\n`;
                }
            }
            
            if (isCreator) {
                userInfo += `🌟 Virtual Founder\n`;
            }
            
            await thinkingMessage.edit(userInfo);
        }

        // Fun commands
        else if (command === 'coinflip') {
            const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
            await thinkingMessage.edit(`🎲 Coin flipped: **${result}**!`);
        }

        else if (command === 'roll') {
            const sides = parseInt(args[0]) || 6;
            const result = Math.floor(Math.random() * sides) + 1;
            await thinkingMessage.edit(`🎲 Rolled a ${sides}-sided die: **${result}**!`);
        }

        else if (command === 'rps') {
            const choices = ['rock', 'paper', 'scissors'];
            const userChoice = args[0]?.toLowerCase();
            
            if (!userChoice || !choices.includes(userChoice)) {
                await thinkingMessage.edit('❌ Please choose rock, paper, or scissors.');
                isProcessing = false;
                return;
            }
            
            const botChoice = choices[Math.floor(Math.random() * choices.length)];
            
            let result;
            if (userChoice === botChoice) {
                result = "It's a tie!";
            } else if (
                (userChoice === 'rock' && botChoice === 'scissors') ||
                (userChoice === 'paper' && botChoice === 'rock') ||
                (userChoice === 'scissors' && botChoice === 'paper')
            ) {
                result = 'You win!';
            } else {
                result = 'I win!';
            }
            
            await thinkingMessage.edit(`🪨📄✂️\nYou chose: **${userChoice}**\nI chose: **${botChoice}**\n\n**${result}**`);
        }

        else if (command === 'joke') {
            const jokes = [
                "Why don't scientists trust atoms? Because they make up everything!",
                "Why did the scarecrow win an award? Because he was outstanding in his field!",
                "Why don't skeletons fight each other? They don't have the guts!",
                "What do you call a fake noodle? An impasta!",
                "Why did the math book look so sad? Because it had too many problems!"
            ];
            const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
            await thinkingMessage.edit(`😂 **Joke:** ${randomJoke}`);
        }

        else if (command === 'quote') {
            const quotes = [
                "The only way to do great work is to love what you do. - Steve Jobs",
                "Life is what happens when you're busy making other plans. - John Lennon",
                "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt",
                "Be yourself; everyone else is already taken. - Oscar Wilde",
                "You only live once, but if you do it right, once is enough. - Mae West"
            ];
            const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
            await thinkingMessage.edit(`💬 **Quote:** ${randomQuote}`);
        }

        else if (command === 'avatar') {
            const user = message.mentions.users.first() || client.user;
            await thinkingMessage.edit(user.displayAvatarURL({ dynamic: true, size: 1024 }));
        }

        else if (command === 'ping') {
            await thinkingMessage.edit(`🏓 Pong! Latency: ${Date.now() - message.createdTimestamp}ms`);
        }

        else if (command === 'help') {
            const helpMessage1 = `
            **🤖 Virtual Selfbot - Command List (1/2)**
            
            **🔧 Utility Commands:**
            \`virtual hi\` - Greet the creator
            \`virtual greet <user/name>\` - Greet a user
            \`virtual spam <count> <text>\` - Spam text (max 20)
            \`virtual afk [time] [message]\` - Enable AFK mode
            \`virtual unafk\` - Disable AFK mode
            \`virtual serverinfo\` - Show server information
            \`virtual userinfo [user]\` - Show user information
            \`virtual avatar [user]\` - Get user avatar
            \`virtual ping\` - Check bot latency
            
            **🎮 Fun Commands:**
            \`virtual coinflip\` - Flip a coin
            \`virtual roll [sides]\` - Roll a die
            \`virtual rps <choice>\` - Play rock paper scissors
            \`virtual joke\` - Tell a random joke
            \`virtual quote\` - Share a random quote
            `;

            await thinkingMessage.edit(helpMessage1);
            
            // Send second part of help
            const helpMessage2 = `
            **🤖 Virtual Selfbot - Command List (2/2)**
            
            **🛡️ Moderation Commands:**
            \`virtual ban <user> [time] [reason]\` - Ban a user
            \`virtual kick <user> [reason]\` - Kick a user
            \`virtual mute/timeout <user> [time] [reason]\` - Mute a user
            \`virtual clear/purge [amount]\` - Clear messages (max 100)
            
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
            
            **💡 Tips:**
            - Use \`virtual updaterole @role #color\` to change color
            - Use \`virtual updaterole @role perm:admin\` to change permissions
            - Use \`virtual updaterole @role New Name\` to change name
            - Color names are case-insensitive
            `;

            await message.channel.send(helpMessage2);
        }

        // Mode-specific commands
        else if (currentMode === 'BitchMode') {
            if (command === 'fuck') {
                await thinkingMessage.edit('Fuck you more! 🖕');
            }
            else if (command === 'insult') {
                const target = message.mentions.users.first() || args[0] || 'yourself';
                await thinkingMessage.edit(`Hey ${target}, you're a worthless piece of shit! 😈`);
            }
        } 
        else if (currentMode === 'LoverMode') {
            if (command === 'love') {
                const target = message.mentions.users.first() || args[0] || 'everyone';
                await thinkingMessage.edit(`I love you, ${target}!\n(っ◔◡◔)っ ♥`);
            }
            else if (command === 'hug') {
                const target = message.mentions.users.first() || args[0] || 'yourself';
                await thinkingMessage.edit(`Sending hugs to ${target}!\n(づ￣ ³￣)づ`);
            }
        } 
        else if (currentMode === 'CoderMode') {
            if (command === 'code') {
                const lang = args[0] || 'javascript';
                const code = args.slice(1).join(' ') || 'console.log("Hello World!")';
                await thinkingMessage.edit(`\`\`\`${lang}\n${code}\n\`\`\``);
            }
            else if (command === 'debug') {
                await thinkingMessage.edit('Debugging... 🤖\nNo errors found! Your code is perfect!');
            }
        } 
        else {
            await thinkingMessage.edit('❌ Unknown command. Use `virtual help` for available commands.');
        }
    } catch (error) {
        console.error(`Error executing command: ${error}`);
        await thinkingMessage.edit(`❌ An error occurred: ${error.message}`);
    }
    
    isProcessing = false;
});

// AFK functionality
client.on('messageCreate', async message => {
    if (afkStatus && message.author.id !== client.user.id && message.mentions.has(client.user.id)) {
        // Calculate remaining time if applicable
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
