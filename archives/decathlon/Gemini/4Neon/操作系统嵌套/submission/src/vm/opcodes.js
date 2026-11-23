// Bytecode opcodes for Nested OS Script (NOS) VM
// Shared identically by vm.js, compiler_bootstrap.js, and /sys/compiler.nos

export const OP = {
  NOP: 0,
  CONST: 1,          // CONST constIdx
  NULL: 2,
  TRUE: 3,
  FALSE: 4,
  POP: 5,
  DUP: 6,
  LOAD_L: 7,         // LOAD_L localIdx
  STORE_L: 8,        // STORE_L localIdx (peeks top)
  LOAD_G: 9,         // LOAD_G globalIdx
  STORE_G: 10,       // STORE_G globalIdx (peeks top)
  ADD: 11,
  SUB: 12,
  MUL: 13,
  DIV: 14,
  MOD: 15,
  NEG: 16,
  NOT: 17,
  EQ: 18,
  NEQ: 19,
  LT: 20,
  LE: 21,
  GT: 22,
  GE: 23,
  JMP: 24,           // JMP addr
  JMP_FALSE: 25,     // JMP_FALSE addr (pops)
  JMP_FALSE_PEEK: 26,// JMP_FALSE_PEEK addr (peeks)
  JMP_TRUE_PEEK: 27, // JMP_TRUE_PEEK addr (peeks)
  MAKE_ARR: 28,      // MAKE_ARR count
  MAKE_OBJ: 29,      // MAKE_OBJ pairCount
  GET_PROP: 30,      // pops key, obj -> pushes obj[key]
  SET_PROP: 31,      // pops val, key, obj -> pushes val
  CALL: 32,          // CALL argc (callee below args)
  RET: 33,
  LOAD_FN: 34,       // LOAD_FN funcIdx
  LOAD_BUILTIN: 35,  // LOAD_BUILTIN nameConstIdx
  SYSCALL: 36,       // SYSCALL argc (name below args)
  TRY_PUSH: 37,      // TRY_PUSH catchAddr
  TRY_POP: 38,
  THROW: 39,
};

export const BUILTIN_NAMES = [
  'len', 'keys', 'has', 'del', 'push', 'pop', 'slice', 'concat',
  'substr', 'index_of', 'split', 'join', 'replace', 'trim', 'lower', 'upper',
  'char_code', 'from_char_code', 'str', 'num', 'int', 'type',
  'abs', 'floor', 'ceil', 'round', 'min', 'max', 'sqrt', 'pow',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan2', 'clamp', 'exp', 'log',
  'clone', 'json_encode', 'json_decode', 'mem_size',
  'vm_create', 'vm_run', 'vm_reply', 'vm_throw', 'vm_info', 'vm_burn',
  'sort_by', 'rand_next', 'hash_str'
];
