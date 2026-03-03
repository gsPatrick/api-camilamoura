# Documentação do Sistema Backend - Advocacia CRM-BOT

## 1. Visão Geral
Este sistema é um Backend em Node.js projetado para automação de triagem jurídica via WhatsApp (Z-API), gerenciamento de leads no Trello e inteligência artificial com OpenAI.

### Arquitetura
-   **Runtime**: Node.js (Express)
-   **Banco de Dados**: PostgreSQL (via Sequelize ORM)
-   **Integrações**:
    -   **Z-API**: Envio e recebimento de mensagens WhatsApp.
    -   **Trello**: Criação e gestão de Cards (Leads).
    -   **OpenAI**: Classificação de casos e análise de urgência.

---

## 2. Instalação e Configuração

### Pré-requisitos
-   Node.js (v14+)
-   PostgreSQL instalado e rodando.
-   Conta na Z-API (WhatsApp).
-   Conta no Trello (API Key e Token).
-   Conta na OpenAI (API Key).

### Instalação
1.  Clone o repositório.
2.  Acesse a pasta `API`:
    ```bash
    cd API
    ```
3.  Instale as dependências:
    ```bash
    npm install
    ```

### Variáveis de Ambiente (.env)
Crie um arquivo `.env` na raiz da pasta `API` com o seguinte conteúdo:

```ini
# Servidor
PORT=3000

# Banco de Dados
DB_HOST=localhost
DB_PORT=5432
DB_NAME=advocacia_crm
DB_USER=seu_usuario_postgres
DB_PASS=sua_senha_postgres
JWT_SECRET=supersecretkey_para_auth

# Integração Z-API (WhatsApp)
ZAPI_INSTANCE_ID=SUA_INSTANCIA_ID
ZAPI_TOKEN=SEU_TOKEN_DA_INSTANCIA
ZAPI_CLIENT_TOKEN=SEU_CLIENT_TOKEN_DE_SEGURANCA

# Integração Trello
TRELLO_KEY=SUA_API_KEY_TRELLO
TRELLO_TOKEN=SEU_TOKEN_TRELLO
TRELLO_BOARD_ID=ID_DO_QUADRO_TRELLO

# Integração OpenAI
OPENAI_API_KEY=SUA_CHAVE_OPENAI
```

### Inicialização do Banco de Dados
O sistema possui um script de "Seed" para criar as tabelas e popular as configurações iniciais (Prompts, Avisos) e o usuário Admin.

```bash
node src/seeders/seed.js
```
*Isso criará o usuário `drcamila@advocacia.com` / `admin123` e os textos padrão.*

### Rodando o Servidor
```bash
npm start
# ou para desenvolvimento com hot-reload:
npm run dev
```

---

## 3. Fluxo de Automação (O "Cérebro")

O arquivo principal é `src/features/automation/automation.service.js`.

### Etapa 1: Recebimento (Webhook)
-   O sistema recebe um POST da Z-API em `/api/webhook/zapi`.
-   Filtra mensagens enviadas pelo próprio bot (`fromMe`).

### 3.1. Fluxo de Segurança e Legado (Trello)
O robô foi projetado para operar em **Modo Seguro** para não poluir boards existentes.

1.  **Busca Global (Raio-X)**:
    -   Ao receber uma mensagem, o robô pesquisa o telefone em **todas as listas** do quadro (incluindo Arquivados).
    -   **Card Existente**: Se encontrado, o robô apenas **adiciona um comentário** com a nova mensagem. Nunca move, altera ou cria duplicata.
    -   **Novo Lead**: Somente se não houver registro nenhum, ele prossegue para a Triagem IA.

2.  **Criação de Card (Formato Legado)**:
    -   **Lista**: Definida dinamicamente via Dashboard (ex: "Triagem").
    -   **Descrição**: Preenchida no formato padrão do escritório:
        ```text
        ÁREA: [Especialidade Identificada]
        
        Telefone: +55...
        **Resumo IA:** ...
        **Urgência:** ...
        ---
        *Relato Original:* ...
        ```
    -   **Etiquetas Inteligentes**:
        -   O Backend aplica a etiqueta correspondente à especialidade (ex: Azul para BPC) conforme mapeamento feito no Dashboard.
        -   Aplica etiqueta de "Urgente" (ex: Vermelha) se a IA detectar gravidade.

### 3.2. Classificação IA (No-Code)
A classificação é baseada no `PROMPT_SISTEMA` gerado dinamicamente a partir do JSON de Especialidades configurado no Frontend.
-   **Entrada**: Array de objetos `{ nome, palavras_chave, regras, id_etiqueta_trello }`.
-   **Processamento**: O Backend converte isso em instruções naturais para o GPT-4.
-   **Saída**: JSON estrito `{ type, urgency, summary }`.

### Etapa 2: Verificação de Cliente
-   **Cliente Existente**: Busca no Trello por um Card que contenha o telefone no título ou descrição.
    -   Se achar: Adiciona a mensagem como **Comentário** no Card. Fim.
    -   Se não achar: Inicia fluxo de Novo Lead.

### Etapa 3: Novo Lead & Gestão de Estado
-   O sistema usa a tabela `Conversations` para saber em que passo o lead está.
-   **Passo 1 (Novo)**: Envia `AVISO_ETICO` (texto configurável) e muda estado para `WAITING_FOR_INPUT`.
-   **Passo 2 (Resposta)**: Quando o cliente responde ao aviso contando o caso:
    1.  Classifica o texto usando a **OpenAI**.
    2.  Verifica **Urgência** (Palavras-chave: Liminar, Doença, Acidente ou Classificação "High").
    3.  Se Urgente: Envia `MSG_PRESENCIAL`.
    4.  Cria Card no **Trello** na lista "Triagem" (ou primeira disponível).
    5.  Se Urgente: Adiciona **Etiqueta Vermelha**.

---

## 4. API Endpoints

### Automação (Public)
| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `POST` | `/api/webhook/zapi` | Endpoint para receber webhooks da Z-API. |

### Configurações (Privado - Requer Header `Authorization: Bearer TOKEN`)
| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/configs` | Retorna todos os textos e prompts do bot. |
| `PUT` | `/api/configs` | Atualiza textos (ex: mudar o prompt da IA). |

### Autenticação (Admin)
| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Login p/ obter Token JWT. Body: `{email, password}` |

---

## 5. Personalização (BotConfig)

Você pode alterar o comportamento do Bot via Banco de Dados ou API (`/api/configs`). As chaves principais são:

-   `AVISO_ETICO`: Primeira mensagem enviada. Contém aviso legal.
-   `MSG_PRESENCIAL`: Mensagem enviada quando detectada urgência.
-   `PROMPT_SISTEMA`: O "cérebro" da IA. Define as regras de classificação (BPC, Trabalhista, etc) baseadas no PDF da Dra. Camila.
-   `SPECIALTIES_JSON`: JSON | Lista de especialidades, regras e IDs de etiquetas (No-Code Builder).
-   `TRELLO_LIST_ID`: String | ID da Lista de Entrada/Triagem (Selecionável via Dropdown).
-   `TRELLO_LABEL_URGENTE_ID`: String | ID da Etiqueta para casos urgentes.

---

## 6. Modelos de Dados

### User
Usuários administrativos do painel.

### BotConfig
Tabela chave-valor para configurações dinâmicas.

### Conversation
Tabela temporária ou persistente para gerenciar o estado do chat do WhatsApp.
-   `phone`: Telefone do lead.
-   `step`: `WAITING_FOR_INPUT` (Esperando relato) ou `PROCESSING`.

---

## 7. Solução de Problemas

-   **Z-API não conecta**: Verifique `INSTANCE_ID`, `TOKEN` e `CLIENT_TOKEN` no .env.
-   **Trello Erro 401**: Verifique `TRELLO_KEY` e `TRELLO_TOKEN`. O Token expira se não for gerado como "never expire".
-   **OpenAI Erro**: Verifique se há créditos na conta da OpenAI.
-   **Banco de Dados**: Certifique-se que o PostgreSQL está rodando e as credenciais no `.env` estão corretas. Erro `ENOTFOUND localhost` indica que o Node não achou o DB.
