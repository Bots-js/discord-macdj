'use strict';

const commands = new Map();

commands.set('add', {
  name: 'add',
  description: 'Add a song to the queue.',
  execute: function (msg, args) {
    if (!args.length) return msg.channel.sendMessage('Usage: add [url]');
    this.player.add(msg, args[0]).then((info) => {
      msg.channel.sendMessage(`Added ${info.title} to the queue.`);
    }).catch(err => console.error(err));
  }
});

commands.set('list', {
  name: 'list',
  description: 'List the songs in queue.',
  execute: function (msg) {
    let list = this.player.list(msg),
        msgArray = [];

    msgArray.push('```');
    for (let i in list) {
      msgArray.push(`${++i}: ${list[i].title}`);
    }
    msgArray.push('```');

    msg.channel.sendMessage(msgArray.join("\n"));
  }
});

commands.set('clear', {
  name: 'clear',
  description: 'Clear the queue.',
  execute: function (msg) {
    this.player.clear();
    msg.channel.sendMessage('The queue is empty.');
  }
});

commands.set('remove', {
  name: 'remove',
  description: 'Remove a song from the queue.',
  execute: function (msg, args) {
    let index = (args.length && !isNaN(parseInt(args[0], 10))) ? args[0] : 1;

    if (msg.channel.isPrivate) return msg.channel.sendMessage("You must be in the channel to use this.");

    const result = this.player.remove(msg, index);
    this.sendMessage(`Removed ${result.title}`);
  }
})

commands.set('play', {
  name: 'play',
  description: 'Play a song.',
  execute: function (msg) {
    let voiceChannel = msg.author.getVoiceChannel(msg.guild);
    if (!voiceChannel) return msg.channel.sendMessage('You should be in a voice channel first.');
    this.player.play(voiceChannel).catch(err => console.error(err));
  }
});

commands.set('stop', {
  name: 'stop',
  description: 'Stop playing.',
  execute: function (msg) {
    let voiceChannel = msg.author.getVoiceChannel(msg.guild);
    this.player.stop(voiceChannel);
  }
});

commands.set('skip', {
  name: 'skip',
  description: 'Skip the current song.',
  execute: function (msg) {
    this.player.skip(msg);
  }
});

commands.set('pause', {
  name: 'pause',
  description: 'Pause playing the current song.',
  execute: function (msg) {
    msg.channel.sendMessage(':middle_finger:');
  }
});

commands.set('resume', {
  name: 'resume',
  description: 'Resume playing the current song.',
  execute: function (msg) {
    msg.channel.sendMessage(':middle_finger:');
  }
});

module.exports = commands;