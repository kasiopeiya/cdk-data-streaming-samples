FROM node:18.18.2

# AWS CLIのインストール
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
RUN unzip awscliv2.zip && ./aws/install && export PATH="$PATH:/aws/dist"

# vimのインストール(gitのeditorとして必要)
RUN apt-get update && apt-get install -y vim

CMD ["bash"]
