"use strict";

const ytdl = require('ytdl-core');
const utils = require('./utils');

class Player {

  constructor(config, main) {
    this.config = config;
    this.main = main;
  }

  /**
   * Start the player module
   * @param  {Object} client Reference to discord client
   */
  start(client) {
    this.client = client;
    this.connections = new Map();
    this.playing = new Map();
    this.queue = this.config.queue = {};
  }

  /**
   * Get or create the voice connection
   * @param  {Object} channel discord.js channel resolvable
   * @return {Promise}        Resolves a connection object
   */
  getConnection(channel) {
    if (this.client.voiceConnections) {
      const info = this.client.voiceConnections.getForGuild(channel.guild_id);
      if (info) return Promise.resolve(info);
    }

    return channel.join(false, false)
      .then((info) => {
        // this.connections.set(channel.guild_id, info);
        this.main.mainWindow.webContents.send('voiceConnect', {
          id: channel.id,
          name: channel.name,
          guild_id: channel.guild_id,
          bitrate: channel.bitrate,
          user_limit: channel.user_limit


        });

        return info;
      })
  }

  /**
   * Destroy the voice connection
   * @param  {Object} channel discord.js channel resolvable
   * @return {Promise}        Resolves when done.
   */
  destroyConnection(channel) {
    this.getConnection(channel).then(info => {
      info.disconnect();
      channel.leave();

      this.main.mainWindow.webContents.send('voiceDisconnect', {
        id: channel.id,
        name: channel.name,
        guild_id: channel.guild_id,
        bitrate: channel.bitrate,
        user_limit: channel.user_limit
      });
    });
  }

  /**
   * Start playing the queue
   * @param  {Object} channel discord.js channel resolvable
   * @return {Promise}
   */
  play(channel) {
    if (!this.queue[channel.guild_id]) return Promise.reject('No songs in queue.');
    return this.getConnection(channel).then(info => {
      let mediaInfo = this.queue[channel.guild_id][0];
      let formats = mediaInfo.formats
        .filter(f => f.container === 'webm')
        .sort((a, b) => b.audioBitrate - a.audioBitrate);
      let bestaudio = formats.find(f => f.audioBitrate > 0 && !f.bitrate) ||
        formats.find(f => f.audioBitrate > 0);
      if (!bestaudio) return;
      this.playing.set(channel.id, true);

      let encoder = info.voiceConnection.createExternalEncoder({
        type: 'ffmpeg',
        format: 'opus',
        source: bestaudio.url,
        frameDuration: 60,
        debug: false
      });

      let encoderStream = encoder.play();

      this.client.User.setStatus("online", { name: mediaInfo.title });

      if (encoderStream.listenerCount('error') < 2) {
        encoderStream.on('error', err => console.error('encoder stream error', err));
      }

      encoder.on('error', err => console.error('encoder error', err));

      encoder.once('end', () => {
        if (this.queue[channel.guild_id].length > 0) {
          this.playing.set(channel.guild_id, false);
          this.queue[channel.guild_id].push(this.queue[channel.guild_id].shift());
          this.main.mainWindow.webContents.send('queueUpdate', {
            guild: channel.guild_id,
            queue: this.queue[channel.guild_id]
          });
          this.play.call(this, channel);
        } else this.queue[channel.guild_id].shift();
      });
    }).catch(error => console.error(error));
  }

  /**
   * Stop playing
   * @param  {Object} channel discord.js channel resolvable
   */
  stop(channel) {
    this.getConnection(channel).then(info => {
      let encoderStream = info.voiceConnection.getEncoderStream();

      encoderStream.unpipeAll();
      info.voiceConnection.disconnect();
      channel.leave();

      this.main.mainWindow.webContents.send('voiceDisconnect', {
        id: channel.id,
        name: channel.name,
        guild_id: channel.guild_id,
        bitrate: channel.bitrate,
        user_limit: channel.user_limit
      });
    });
  }

  /**
   * Skip song
   * @param  {Object} msg discord.js message resolvable
   */
  skip(msg) {
    let channel = msg.author.getVoiceChannel(msg.guild.id);

    // return if there's nothing in queue
    if (!this.queue[msg.guild.id]) return;

    this.getConnection(channel).then(info => {
      let encoderStream = info.voiceConnection.getEncoderStream();
      encoderStream.unpipeAll();

      // shift the queue
      this.queue[msg.guild.id].push(this.queue[msg.guild.id].shift());

      this.main.mainWindow.webContents.send('queueUpdate', {
        guild: msg.guild.id,
        queue: this.queue[msg.guild.id]
      });

      // play the next song
      this.play(channel);
    });
  }

  /**
   * NOT FUNCTIONAL
   * Pause song
   * @param  {Object} msg discord.js message resolvable
   */
  pause(channel) {
    this.getConnection(channel).then(connection => connection.pause());
  }

  /**
   * NOT FUNCTIONAL
   * Resume song
   * @param  {Object} msg discord.js message resolvable
   */
  resume(channel) {
    this.getConnection(channel).then(connection => connection.resume());
  }

  /**
   * Add song to queue
   * @param {Object} msg     discord.js message resolvable
   * @param {Object} songObj Youtube song object
   */
  add(guildId, voiceChannel, url) {
    url = url.replace('/<|>/g', '');

    this.queue[guildId] = this.queue[guildId] || [];

    return new Promise((resolve, reject) => {
      ytdl.getInfo(url, (err, info) => {
        if (err) {
          console.error(err);
          return reject(err);
        }

        if (!info.video_id) return reject('No video id.');
        info.betterTime = utils.betterTime(info.length_seconds);
        this.queue[guildId].push(info);

        this.main.mainWindow.webContents.send('queueUpdate', {
          guild: guildId,
          queue: this.queue[guildId]
        });

        if (!this.getPlayingState(voiceChannel)) {
          this.play(voiceChannel);
        }

        resolve(info);
      });
    });
  }

  /**
   * Remove song from queue
   * @param  {Object} guildId id of guild to remove the song from.
   * @param  {Number} index Index of song to remove
   */
  remove(guildId, index) {
    let result;

    // return if there's nothing in queue
    if (!this.queue[guildId]) return;
    // remove the first song if there's no index
    if (!index) result = this.queue[guildId].shift();
    else result = this.queue[guildId].splice(--index, 1).shift();

    this.main.mainWindow.webContents.send('queueUpdate', {
      guild: guildId,
      queue: this.queue[guildId]
    });

    return result;
  }

  /**
   * List songs in queue
   * @param  {Object} msg discord.js message resolvable
   * @return {Array}      List of songs in queue
   */
  list(msg) {
    return this.queue[msg.guild.id];
  }

  /**
   * Clear the song queue
   * @param  {Object} msg discord.js message resolvable
   */
  clear(msg) {
    this.queue[msg.guild.id] = [];
    this.main.mainWindow.webContents.send('queueUpdate', {
      guild: msg.guild.id,
      queue: this.queue[msg.guild.id]
    });
  }

  /**
   * Checks if the bot is currently playing audio
   * @param channel
   * @returns {boolean}
   */
  getPlayingState(channel) {
    return this.playing.get(channel.id) === true;
  }

  /**
   * NOT FUNCTIONAL
   * Set volume to play in discord
   * @param  {Object} channel discord.js channel resolvable
   * @param  {Float} volume   Volume level (0-1.5)
   */
  volume(channel, volume) {
    this.getConnection(channel).then(connection => {
      if (volume) return connection.setVolume(volume);
      return connection.getVolume();
    });
  }
}

module.exports = Player;
