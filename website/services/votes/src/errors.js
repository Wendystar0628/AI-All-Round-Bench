// 错误代码、状态码和中英两份说明。接口的错误一律是 {error: <代码>, message: {zh, en}}（votes.md 第 10.2 节）。

export const ERRORS = {
  bad_request: [400, '请求格式不对。', 'The request is malformed.'],
  pow_required: [403, '浏览器正在做一道投票前的小验算，请稍候再投。', 'Your browser needs to finish a quick check before voting.'],
  not_found: [404, '没有这个接口。', 'No such endpoint.'],
  not_votable: [404, '这件作品现在不能投票。', 'This work is not open for votes.'],
  method_not_allowed: [405, '不支持这种请求方式。', 'Method not allowed.'],
  limit_reached: [409, '这一卷的两票已经用完，撤回一票就能改投。', 'Both votes for this volume are used. Retract one to vote again.'],
  already_voted: [409, '这件作品你已经投过了。', 'You have already voted for this work.'],
  rate_limited: [429, '投得太快了，稍等一下再试。', 'Too fast. Please wait a moment and try again.'],
  closed: [503, '票箱暂时关着。', 'The ballot box is closed for now.'],
};

export class VoteError extends Error {
  /** @param {keyof ERRORS} code  @param {object} [extra] 随错误一起返回的字段，如 votes、retryAfter */
  constructor(code, extra = {}) {
    super(code);
    this.code = code;
    this.extra = extra;
  }
}

export function errorBody(code, extra = {}) {
  const [, zh, en] = ERRORS[code];
  return { error: code, message: { zh, en }, ...extra };
}

export function errorStatus(code) {
  return ERRORS[code][0];
}
