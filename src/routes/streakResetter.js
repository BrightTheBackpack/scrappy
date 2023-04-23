// This API route is pinged by a Zap every hour

import { getNow, timeout } from '../lib/utils.js'
import { setStatus } from '../lib/profiles.js'
import prisma from '../lib/prisma.js'
import fetch from 'node-fetch'

export default async (req, res) => {
  res.status(200).end()
  const users = await prisma.accounts.findMany({
    where: {
      streakCount: {
        gt: 0
      }
    }
  })
  console.log(users)
  users.forEach(async (user) => {
    await timeout(500)
    const userId = user.slackID
    const timezone = user.timezone
    const username = user.username
    let now = new Date(getNow(timezone))
    now.setHours(now.getHours() - 4)
    const latestUpdate = await prisma.updates.findFirst({
      where: {
        accountsSlackID: userId
      },
      orderBy: [
        {
          postTime: 'desc'
        }
      ]
    })
    const createdTime = latestUpdate?.postTime
    if (!createdTime) {
      // @msw: this fixes a bug where a user creates their first post then deletes it before streak resetter runs
      // this prevents trying to reset streaks based on a user without posts
      return
    }
    const createdDate = new Date(createdTime)
    const yesterday = new Date(getNow(timezone))
    yesterday.setDate(createdDate.getDate() - 1)
    yesterday.setHours(0)
    yesterday.setMinutes(0)
    if (createdDate >= yesterday && user.streakCount != 0) {
      console.log(
        `It's been more than a day since ${username} last posted. Resetting their streak...`
      )
      await prisma.accounts.update({
        where: { slackID: user.slackID },
        data: { streakCount: 0 }
      })
      if (user.displayStreak) {
        try {
          await setStatus(userId, '', '')
        }
        catch(e) {
          app.client.chat.postMessage({
            channel: "USNPNJXNX",
            text: t("messages.errors.zach"),
          });
        }
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`
          },
          body: JSON.stringify({
            channel: userId, //userId
            text: `<@${userId}> It's been more than 24 hours since you last posted a Scrapbook update, so I've reset your streak. No worries, though—post something else to start another streak! And the rest of your updates are still available at https://scrapbook.hackclub.com/${username} :)`
          })
        })
      }
    }
  })
}

const shouldReset = (now, createdDate) => {
  if (createdDate === 30 && (now.getDate() === 1 || now.getDate() === 2)) {
    return now.getDate() - createdDate > -29
  } else if (
    createdDate === 31 &&
    (now.getDate() === 1 || now.getDate() === 2)
  ) {
    return now.getDate() - createdDate > -30
  } else if (
    createdDate === 1 &&
    (now.getDate() === 30 || now.getDate() === 31)
  ) {
    return false
  } else {
    return now.getDate() - createdDate > 1
  }
}
