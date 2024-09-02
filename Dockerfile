FROM node:18.18.2

# AWS CLIのインストール
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
RUN unzip awscliv2.zip && ./aws/install && export PATH="$PATH:/aws/dist"

# vimのインストール(gitのeditorとして必要)
RUN apt-get update && apt-get install -y vim
COPY .devcontainer/.vimrc /root/.vimrc:ro

# CloudWatch Agent
RUN wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb && \
    dpkg -i -E amazon-cloudwatch-agent.deb && \
    rm -rf /tmp/* && \
    rm -rf amazon-cloudwatch-agent.deb && \
    rm -rf /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard && \
    rm -rf /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl && \
    rm -rf /opt/aws/amazon-cloudwatch-agent/bin/config-downloader
COPY script/cwAgent.json /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json:ro
RUN nohup /opt/aws/amazon-cloudwatch-agent/bin/start-amazon-cloudwatch-agent > /dev/null 2> /dev/null &

CMD ["bash"]
