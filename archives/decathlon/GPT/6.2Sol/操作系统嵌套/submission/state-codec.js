// The wire format keeps shared VM cells and suspended call frames intact in JSON.
const FORMAT='strata-references/1';

export function encodeState(root){
  const nodes=[],seen=new WeakMap();
  function encode(value){
    if(value===undefined)return ['undefined'];
    if(typeof value==='number'){
      if(!Number.isFinite(value)||Object.is(value,-0))return ['number',Object.is(value,-0)?'-0':String(value)];
      return value;
    }
    if(typeof value==='bigint')return ['integer',String(value)];
    if(value===null||typeof value!=='object')return value;
    if(seen.has(value))return ['ref',seen.get(value)];
    const index=nodes.length;
    nodes.push(null);seen.set(value,index);
    if(Array.isArray(value)){
      const entries=[];
      for(let i=0;i<value.length;i++)entries.push(Object.hasOwn(value,i)?encode(value[i]):['hole']);
      const extras=Object.keys(value).filter(key=>!/^\d+$/.test(key)||String(Number(key))!==key||Number(key)>=value.length);
      nodes[index]=['array',entries,extras.map(key=>[key,encode(value[key])])];
    }else if(value instanceof RegExp){
      nodes[index]=['regexp',[value.source,value.flags,value.lastIndex]];
    }else{
      nodes[index]=['object',Object.entries(value).map(([k,v])=>[k,encode(v)])];
    }
    return ['ref',index];
  }
  return {format:FORMAT,root:encode(root),nodes};
}

export function decodeState(data){
  if(data?.format!==FORMAT)return data;
  if(!Array.isArray(data.nodes)||data.nodes.length>2000000)throw Error('状态索引无效');
  const objects=data.nodes.map(entry=>{
    if(!Array.isArray(entry)||!Array.isArray(entry[1]))throw Error('状态节点无效');
    const [kind,payload]=entry;
    if(kind==='array')return new Array(payload.length);
    if(kind==='object')return {};
    if(kind==='regexp'){
      const re=new RegExp(payload[0],payload[1]);re.lastIndex=payload[2];return re;
    }
    throw Error('不支持的状态节点');
  });
  function decode(value){
    if(!Array.isArray(value))return value;
    const [kind,data]=value;
    if(kind==='undefined')return undefined;
    if(kind==='integer')return BigInt(data);
    if(kind==='number')return Number(data);
    if(kind==='ref'&&Number.isInteger(data)&&data>=0&&data<objects.length)return objects[data];
    throw Error('状态引用无效');
  }
  for(let i=0;i<data.nodes.length;i++){
    const [kind,entries,extras]=data.nodes[i],object=objects[i];
    if(kind==='array'){
      for(let j=0;j<entries.length;j++)if(entries[j]?.[0]!=='hole')object[j]=decode(entries[j]);
      for(const [key,value] of extras??[])Object.defineProperty(object,key,{enumerable:true,configurable:true,writable:true,value:decode(value)});
    }else if(kind==='object'){
      for(const [key,value] of entries)Object.defineProperty(object,key,{enumerable:true,configurable:true,writable:true,value:decode(value)});
    }
  }
  return decode(data.root);
}
