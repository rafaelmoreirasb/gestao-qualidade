/* ==========================================================
   pel/config.js · Configuração da Calculadora PEL
   ----------------------------------------------------------
   Os dois valores abaixo vêm do Supabase
   (Project Settings > Data API > Project URL e
    Project Settings > API Keys > chave pública).
   Use um projeto SEPARADO do Gestão de Qualidade: lá o cadastro
   público está desligado e qualquer conta logada vê todas as abas.
   Na Calculadora qualquer pessoa com e-mail DHL cria a própria conta.
   NUNCA cole aqui a chave secreta (secret / service_role).
   ========================================================== */
const PEL_SUPABASE_URL = 'COLE_AQUI_A_PROJECT_URL';
const PEL_SUPABASE_CHAVE_PUBLICA = 'COLE_AQUI_A_CHAVE_PUBLICA';

// Só e-mails deste domínio podem criar conta na Calculadora
const PEL_DOMINIO = '@dhl.com';
