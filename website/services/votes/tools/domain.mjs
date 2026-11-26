// 接口域名 api.wendystars.com：函数计算的自定义域名，证书用数字证书管理服务的免费 DV 证书（DNS 验证）。
//   node tools/domain.mjs setup    第一次：加 CNAME（已有就跳过），再做一遍 renew
//   node tools/domain.mjs renew    申请新证书 → 加验证 TXT → 等签发 → 删验证 TXT → 装到自定义域名（没有就建）
//   node tools/domain.mjs install  把已签发的最新一张证书装到自定义域名（renew 中途断了时用）
//   node tools/domain.mjs status   看自定义域名的协议、路由和证书到期日
// 只动 wendystars.com 下 api 的 CNAME 和 _dnsauth 验证 TXT 这两种记录。证书私钥只经命令参数交给 aliyun，不打印、不落盘。
import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { FUNCTION, REGION } from './common.mjs';

const PROFILE = 'octathlon';
const ZONE = 'wendystars.com';
const HOST = 'api';
const DOMAIN = `${HOST}.${ZONE}`;
const PRODUCT = 'digicert-free-1-free';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let hidden = [];
const redact = text => hidden.reduce((t, h) => t.split(h).join('******'), String(text));

function aliyun(...args) {
  try {
    const out = execFileSync('aliyun', [...args, '--profile', PROFILE, '--region', REGION], {
      encoding: 'utf8', maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MSYS_NO_PATHCONV: '1' },
    });
    return out.trim() ? JSON.parse(out) : {};
  } catch (err) {
    // 不用 err.message：它带着整条命令（可能有私钥）
    const detail = redact(`${err.stdout ?? ''}${err.stderr ?? ''}`).trim();
    const e = new Error(`aliyun ${args.slice(0, 2).join(' ')} 失败：${detail.slice(0, 1500)}`);
    e.detail = detail;
    throw e;
  }
}

function records(rr, type) {
  const d = aliyun('alidns', 'DescribeSubDomainRecords', '--SubDomain', rr ? `${rr}.${ZONE}` : ZONE, '--Type', type);
  return d.DomainRecords?.Record ?? [];
}

function fcEndpoint() {
  const { AccountId } = aliyun('sts', 'GetCallerIdentity');
  return `${AccountId}.${REGION}.fc.aliyuncs.com`;
}

function ensureCname() {
  const target = fcEndpoint();
  const existing = records(HOST, 'CNAME');
  if (existing.some(r => r.Value === target)) return console.log(`CNAME ${DOMAIN} → ${target} 已有`);
  if (existing.length || records(HOST, 'A').length) throw new Error(`${DOMAIN} 已有别的记录，不动它，请先人工确认`);
  aliyun('alidns', 'AddDomainRecord', '--DomainName', ZONE, '--RR', HOST, '--Type', 'CNAME', '--Value', target, '--TTL', '600');
  console.log(`已加 CNAME ${DOMAIN} → ${target}`);
}

async function applyCertificate() {
  const { OrderId } = aliyun('cas', 'CreateCertificateForPackageRequest', '--ProductCode', PRODUCT, '--Domain', DOMAIN, '--ValidateType', 'DNS');
  console.log(`已申请免费 DV 证书，订单 ${OrderId}`);
  const added = [];
  const seen = new Map();   // 验证用的 TXT：主机记录 → 值
  try {
    for (let i = 0; i < 180; i++) {
      const s = aliyun('cas', 'DescribeCertificateState', '--OrderId', String(OrderId));
      if (s.Certificate) hidden.push(s.Certificate);
      if (s.PrivateKey) hidden.push(s.PrivateKey);
      if (s.Type === 'certificate') {
        console.log(`证书已签发，CertId ${s.CertId}`);
        return s.CertId;
      }
      if (s.Type === 'verify_fail') throw new Error('CA 验证失败');
      if (s.Type === 'domain_verify' && s.RecordType === 'TXT' && s.RecordValue) {
        const rr = String(s.RecordDomain).replace(new RegExp(`\\.?${ZONE.replace('.', '\\.')}$`), '');
        seen.set(rr, s.RecordValue);
        if (!records(rr, 'TXT').some(r => r.Value === s.RecordValue)) {
          const { RecordId } = aliyun('alidns', 'AddDomainRecord', '--DomainName', ZONE, '--RR', rr, '--Type', 'TXT', '--Value', s.RecordValue, '--TTL', '600');
          console.log(`已加验证 TXT ${rr}.${ZONE}`);
          added.push(RecordId);
        }
      }
      if (i % 6 === 0) console.log(`等签发：${s.Type}`);
      await sleep(10_000);
    }
    throw new Error('等了 30 分钟还没签发');
  } finally {
    // 验证 TXT 用完就删：本次加的，以及证书服务自己加的同一条（主机记录和值都对得上才删）
    const same = [...seen].flatMap(([rr, value]) => records(rr, 'TXT').filter(r => r.Value === value).map(r => r.RecordId));
    for (const id of new Set([...added, ...same])) {
      try { aliyun('alidns', 'DeleteDomainRecord', '--RecordId', id); console.log('已删验证 TXT'); } catch (e) { console.error(e.message); }
    }
  }
}

function latestCertId() {
  const d = aliyun('cas', 'ListUserCertificateOrder', '--OrderType', 'CERT', '--Keyword', DOMAIN, '--ShowSize', '50');
  const certs = (d.CertificateOrderList ?? []).filter(c => c.Status === 'ISSUED' && String(c.Sans ?? c.CommonName ?? '').split(',').includes(DOMAIN));
  certs.sort((a, b) => String(b.EndDate).localeCompare(String(a.EndDate)));
  if (!certs.length) throw new Error(`没有 ${DOMAIN} 的已签发证书`);
  return certs[0].CertificateId;
}

function getDomain() {
  try { return aliyun('fc', 'GET', `/2023-03-30/custom-domains/${DOMAIN}`); }
  catch (e) { if (/DomainNameNotFound|NotFound|404/.test(e.detail ?? '')) return null; throw e; }
}

function install(certId) {
  const detail = aliyun('cas', 'GetUserCertificateDetail', '--CertId', String(certId));
  hidden.push(detail.Cert, detail.Key);
  const body = {
    protocol: 'HTTPS',
    certConfig: { certName: `api-wendystars-com-${certId}`, certificate: detail.Cert, privateKey: detail.Key },
    routeConfig: { routes: [{ path: '/*', functionName: FUNCTION, qualifier: 'LATEST' }] },
    authConfig: { authType: 'anonymous' },
  };
  const exists = !!getDomain();
  if (exists) aliyun('fc', 'PUT', `/2023-03-30/custom-domains/${DOMAIN}`, '--header', 'Content-Type=application/json', '--body', JSON.stringify(body));
  else aliyun('fc', 'POST', '/2023-03-30/custom-domains', '--header', 'Content-Type=application/json', '--body', JSON.stringify({ domainName: DOMAIN, ...body }));
  console.log(`${exists ? '已更新' : '已创建'}自定义域名 ${DOMAIN}（仅 HTTPS，/* → ${FUNCTION}），证书 ${certId}，到期 ${detail.EndDate}`);
}

function status() {
  const d = getDomain();
  if (!d) return console.log(`还没有自定义域名 ${DOMAIN}`);
  const pem = d.certConfig?.certificate;
  const cert = pem ? new X509Certificate(pem) : null;
  console.log(JSON.stringify({
    domain: d.domainName, protocol: d.protocol, routes: d.routeConfig?.routes?.map(r => `${r.path} → ${r.functionName}`),
    cert: d.certConfig?.certName, subject: cert?.subjectAltName, validTo: cert?.validTo,
  }, null, 2));
}

const op = process.argv[2];
try {
  if (op === 'setup') { ensureCname(); install(await applyCertificate()); }
  else if (op === 'renew') install(await applyCertificate());
  else if (op === 'install') install(process.argv[3] ?? latestCertId());
  else if (op === 'status') status();
  else { console.error('用法：node tools/domain.mjs setup | renew | install [CertId] | status'); process.exit(2); }
} catch (err) {
  console.error(redact(err.message));
  process.exit(1);
}
