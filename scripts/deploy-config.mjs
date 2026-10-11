// CONTEXT는 빌드 시 읽어 함수에 포함해요. 런타임 환경 변수의 암묵적 전달에 기대지 않아요.
export function deployConfig(env) {
  const context = env.CONTEXT || 'dev';
  if (context === 'production') return { context, storeName:'geuljari-articles-v1' };
  if (context === 'dev' && !env.NETLIFY) return { context, storeName:'geuljari-local-v1' };
  if (!['deploy-preview','branch-deploy','dev'].includes(context) || !/^[a-zA-Z0-9-]{1,64}$/.test(env.DEPLOY_ID || '')) {
    throw new Error('Netlify 배포 컨텍스트를 확인할 수 없어요. 운영 저장소를 임의로 선택하지 않아요.');
  }
  return { context, storeName:'geuljari-preview-' + env.DEPLOY_ID };
}
