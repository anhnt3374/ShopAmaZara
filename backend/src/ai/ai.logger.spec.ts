import { AiLogger } from './ai.logger';

describe('AiLogger', () => {
  it('records a turn outcome with metrics', () => {
    const logger = new AiLogger();
    const spy = jest.spyOn(logger['nest'], 'log').mockImplementation();
    logger.recordTurn({
      userId: '7', conversationId: '12', requestId: 'r1',
      durationMs: 1234, tokensIn: 100, tokensOut: 50,
      toolsCalled: ['search_products'], outcome: 'ok',
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatch(/"outcome":"ok"/);
    expect(spy.mock.calls[0][0]).toMatch(/"toolsCalled":\["search_products"\]/);
  });
});
