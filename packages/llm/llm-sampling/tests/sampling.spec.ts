/** Sampling changes must reach the adapter and the durable request header together. */
import { expect, it, onTestFinished } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { liveConfig } from '../../../settings/settings/tests/live-config.ts'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import * as Sampling from '../src/index.ts'

it('updates and resets a logged override on the same Agent, rejects invalid input, and removes its listener on unload', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  const live = await liveConfig(ctx, Sampling, { temperature: 0.75 })
  const adapter = new MockAdapter([textResponse('one'), textResponse('two'), textResponse('three')])
  ctx.llm.registerAdapter(['mock'], adapter)
  const agent = await ctx.agentLoop.create(SessionId('sampling-test'), { provider: 'mock', model: 'mock' })
  async function turn(agent: Agent): Promise<void> {
    const idle = new Promise<void>((resolve) => {
      const dispose = ctx.on('agent/status', ({ agent: current, status }) => {
        if (current === agent && status === 'idle') { dispose(); resolve() }
      })
    })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'probe' }], source: { kind: 'user' } }))
    await idle
  }
  await turn(agent)
  expect(adapter.requests[0]?.temperature).toBe(0.75)
  expect(agent.session.requestHeader()?.config.temperature).toBe(0.75)
  await expect(live.update({ temperature: 3 })).rejects.toThrow()
  await live.replace({})
  await turn(agent)
  expect(adapter.requests[1]?.temperature).toBeUndefined()
  expect(agent.session.requestHeader()?.config.temperature).toBeUndefined()
  await live.update({ temperature: 0.25 })
  await live.entry.update({ disabled: true })
  await turn(agent)
  expect(adapter.requests[2]?.temperature).toBeUndefined()
})
