// Builders for synthetic stream-json sessions used by the tests.
export const call = (id: string, name = 'Read', input: object = {}) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } })
export const result = (id: string, text: string, isError = false) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }], is_error: isError }] } })
export const say = (text: string) => ({ type: 'assistant', message: { content: [{ type: 'text', text }] } })
export const stream = (events: object[]) => events.map((event) => JSON.stringify(event)).join('\n')
